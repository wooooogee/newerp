import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  ArrowRight,
  Database,
  Truck,
  FileText,
  HelpCircle,
  Clock,
  Sparkles,
  Info,
  Lock,
  UserCheck,
  Package
} from 'lucide-react';

interface ExcelSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncSuccess: () => Promise<void>;
  currentUser?: any;
}

interface SyncStats {
  totalExistingCount: number;
  newContractCount: number;
  updatedContractCount: number;
  preservedManualStatusCount: number;
  deliveryCompletedCount: number;
  deliveryExpectedCount: number;
  feeDateCalculatedCount: number;
  preservedManualFeeDateCount: number;
  finalTotalCount: number;
  sampleNewRows?: any[];
  sampleUpdatedRows?: any[];
}

export const ExcelSyncModal: React.FC<ExcelSyncModalProps> = ({
  isOpen,
  onClose,
  onSyncSuccess,
  currentUser
}) => {
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [contractRows, setContractRows] = useState<any[][] | null>(null);
  const [contractFileName, setContractFileName] = useState<string>('');

  interface DeliveryFileInfo {
    name: string;
    rowCount: number;
  }

  const [deliveryFileTables, setDeliveryFileTables] = useState<{ fileName: string; rows: any[][] }[]>([]);
  const [deliveryFilesInfo, setDeliveryFilesInfo] = useState<DeliveryFileInfo[]>([]);
  const [deliveryRows, setDeliveryRows] = useState<any[][] | null>(null);
  const [deliveryPassword, setDeliveryPassword] = useState<string>('1111');

  const [autoBackup, setAutoBackup] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingText, setLoadingText] = useState<string>('');

  const [previewStats, setPreviewStats] = useState<SyncStats | null>(null);
  const [completedResult, setCompletedResult] = useState<{
    backupTitle?: string;
    sheet1OverwrittenCount?: number;
    sheet1UpdatedCount?: number;
    sheet1NewCount?: number;
    sheet1ExistingCount?: number;
    sheet1Error?: string | null;
    deliveryOverwrittenCount?: number;
    deliveryUpdatedCount?: number;
    deliveryNewCount?: number;
    deliveryExistingCount?: number;
    deliveryError?: string | null;
    filterAndFormatApplied?: boolean;
    filterAndFormatError?: string | null;
    stats: SyncStats;
  } | null>(null);

  const contractInputRef = useRef<HTMLInputElement>(null);
  const deliveryInputRef = useRef<HTMLInputElement>(null);

  // 사원리스트 상태 (스마트 병합)
  const [employeeFile, setEmployeeFile] = useState<File | null>(null);
  const [employeeRows, setEmployeeRows] = useState<any[][] | null>(null);
  const [employeeFileName, setEmployeeFileName] = useState<string>('');
  const [employeeActiveCount, setEmployeeActiveCount] = useState<number>(0);
  const employeeInputRef = useRef<HTMLInputElement>(null);

  // 수기발주 상태
  const [manualOrderFile, setManualOrderFile] = useState<File | null>(null);
  const [manualOrderRows, setManualOrderRows] = useState<any[][] | null>(null);
  const [manualOrderFileName, setManualOrderFileName] = useState<string>('');
  const manualOrderInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Latin-1 깨짐 감지 헬퍼 (°¡ÀÔ, ÀÌ¿µ¼÷, ·ùÁø¼­ 등)
  const isBrokenLatin1 = (str: string): boolean => {
    if (!str || typeof str !== 'string') return false;
    const latinHighCount = (str.match(/[\u0080-\u00FF]/g) || []).length;
    return latinHighCount >= 2;
  };

  // Latin-1 바이트를 EUC-KR 한글로 복구하는 헬퍼
  const fixLatin1ToEucKr = (str: string): string => {
    if (!str || typeof str !== 'string') return str;
    try {
      const bytes = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) {
        bytes[i] = str.charCodeAt(i) & 0xFF;
      }
      const decoder = new TextDecoder('euc-kr');
      const decoded = decoder.decode(bytes);
      if (/[가-힣]/.test(decoded)) {
        return decoded;
      }
    } catch (e) {}
    return str;
  };

  // 2차원 배열 전체의 깨진 한글 자동 복원
  const autoRepairRowEncoding = (rows: any[][]): any[][] => {
    return rows.map(row => {
      if (!Array.isArray(row)) return row;
      return row.map(cell => {
        if (typeof cell === 'string' && isBrokenLatin1(cell)) {
          return fixLatin1ToEucKr(cell);
        }
        return cell;
      });
    });
  };

  // 엑셀 파싱 시 앞자리 0이 유실되기 쉬운 은행코드 및 계좌번호(국민은행/우체국/하나은행 등 13자리 계좌) 자동 정규화 및 복원
  const autoRepairAccountAndBankCodes = (rows: any[][]): any[][] => {
    if (!rows || rows.length < 2) return rows;
    const header = rows[0] || [];
    const idxBankCode = header.findIndex((h: any) => String(h || '').replace(/\s+/g, '').includes('은행코드'));
    const idxBankName = header.findIndex((h: any) => String(h || '').replace(/\s+/g, '').includes('은행명'));
    const idxAccountNo = header.findIndex((h: any) => String(h || '').replace(/\s+/g, '').includes('계좌번호'));

    if (idxBankCode === -1 && idxAccountNo === -1) return rows;

    return rows.map((row, rIdx) => {
      if (rIdx === 0 || !Array.isArray(row)) return row;
      const newRow = [...row];

      // 은행코드 1~2자리 숫자인 경우 3자리 패딩 (예: 4 -> 004, 88 -> 088)
      if (idxBankCode !== -1 && newRow[idxBankCode] !== undefined) {
        const bCode = String(newRow[idxBankCode] || '').trim();
        if (/^[0-9]{1,2}$/.test(bCode)) {
          newRow[idxBankCode] = bCode.padStart(3, '0');
        }
      }

      // 계좌번호 앞자리 0 누락 복원
      if (idxAccountNo !== -1 && newRow[idxAccountNo] !== undefined) {
        const acc = String(newRow[idxAccountNo] || '').trim();
        const bCode = idxBankCode !== -1 ? String(newRow[idxBankCode] || '').trim() : '';
        const bName = idxBankName !== -1 ? String(newRow[idxBankName] || '').trim() : '';

        // 국민(004), 우체국(071), 하나(081) 13자리 순수 숫자 계좌 -> 앞자리 0 추가하여 14자리로 복원
        if (/^[0-9]{13}$/.test(acc)) {
          if (bCode === '004' || bCode === '4' || bName.includes('국민')) {
            newRow[idxAccountNo] = '0' + acc;
          } else if (bCode === '071' || bCode === '71' || bName.includes('우체국')) {
            newRow[idxAccountNo] = '0' + acc;
          } else if (bCode === '081' || bCode === '81' || bName.includes('하나')) {
            newRow[idxAccountNo] = '0' + acc;
          }
        }
      }

      return newRow;
    });
  };

  // 서버 복호화 API 호출 (비밀번호: 기본값 1111)
  const decryptExcelViaServer = async (file: File, password: string): Promise<any[][]> => {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const fileBase64 = btoa(binary);

    const res = await fetch('/api/sheets/excel-sync/decrypt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileBase64,
        password: password || '1111'
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || '비밀번호가 올바르지 않거나 복호화에 실패했습니다.');
    }

    const data = await res.json();
    return data.rows;
  };

  // HTML 테이블 파싱 헬퍼 (ASP.NET GridView 및 HTML 기반 가짜 .xls 엑셀 지원)
  const parseHtmlTableToRows = (html: string): any[][] => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // 모든 table 요소 중 tr이 가장 많은 메인 데이터 테이블 찾기
      const tables = Array.from(doc.querySelectorAll('table'));
      if (tables.length === 0) return [];

      let mainTable = tables[0];
      let maxTr = 0;
      for (const tbl of tables) {
        const trCount = tbl.querySelectorAll('tr').length;
        if (trCount > maxTr) {
          maxTr = trCount;
          mainTable = tbl;
        }
      }

      const trList = mainTable.querySelectorAll('tr');
      const rows: any[][] = [];

      for (const tr of Array.from(trList)) {
        const cells = tr.querySelectorAll('th, td');
        if (cells.length === 0) continue;

        const rowData: string[] = [];
        cells.forEach(cell => {
          let text = cell.textContent || '';
          text = text.replace(/[\u00a0\r\n\t]+/g, ' ').trim();
          rowData.push(text);
        });

        if (rowData.some(val => val !== '')) {
          rows.push(rowData);
        }
      }

      return rows;
    } catch (err) {
      console.warn('[ExcelSync] parseHtmlTableToRows error:', err);
      return [];
    }
  };

  // 엑셀 파일 파싱 헬퍼 (EUC-KR / CP949 / UTF-8 및 HTML .xls, 암호화 파일 자동 복호화)
  const parseExcelFile = async (file: File, password?: string): Promise<any[][]> => {
    const XLSX = (window as any).XLSX;
    if (!XLSX) throw new Error('XLSX 라이브러리를 불러올 수 없습니다. 페이지를 새로고침해 주세요.');

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // 1. 바이너리 엑셀 포맷 판별
    const isZipXlsx = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
    const isCfbXls = bytes.length > 4 && bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0;

    // 🌟 1-1. 텍스트/HTML 기반 엑셀 (ASP.NET GridView 출력물 등 .xls 확장자로 저장된 HTML 테이블) 우선 감지
    if (!isZipXlsx && !isCfbXls) {
      let eucText = '';
      let utfText = '';
      try { eucText = new TextDecoder('euc-kr', { fatal: false }).decode(buffer); } catch (e) {}
      try { utfText = new TextDecoder('utf-8', { fatal: false }).decode(buffer); } catch (e) {}

      // 인코딩 판별: charset 메타태그 우선 확인
      let chosenText = eucText;
      const combined = (utfText || '') + (eucText || '');
      const charsetMatch = combined.match(/charset=["']?([a-zA-Z0-9_-]+)/i);

      if (charsetMatch) {
        const cs = charsetMatch[1].toLowerCase();
        if (cs.includes('utf') || cs.includes('65001')) {
          chosenText = utfText;
        } else {
          chosenText = eucText;
        }
      } else {
        // charset 명시가 없으면 한글 검출 개수 및 깨짐(FFFD) 비교
        const eucHangul = (eucText.match(/[가-힣]/g) || []).length;
        const eucBroken = (eucText.match(/\uFFFD/g) || []).length;
        const utfHangul = (utfText.match(/[가-힣]/g) || []).length;
        const utfBroken = (utfText.match(/\uFFFD/g) || []).length;

        if (utfHangul > eucHangul && utfBroken === 0) {
          chosenText = utfText;
        } else {
          chosenText = eucText;
        }
      }

      // HTML 태그 포함 여부 확인 (<table, <tr, <td 등)
      const lower = chosenText.toLowerCase();
      if (lower.includes('<table') || (lower.includes('<tr') && lower.includes('<td'))) {
        const parsedRows = parseHtmlTableToRows(chosenText);
        if (parsedRows && parsedRows.length > 0) {
          return autoRepairAccountAndBankCodes(autoRepairRowEncoding(parsedRows));
        }
      }
    }

    let workbook: any = null;

    try {
      if (isZipXlsx || isCfbXls) {
        workbook = XLSX.read(buffer, { type: 'array', cellDates: false, codepage: 949, raw: false, cellText: true });
      } else {
        let decodedText = '';
        try {
          decodedText = new TextDecoder('euc-kr').decode(buffer);
        } catch (e) {}

        if (decodedText && /[가-힣]/.test(decodedText)) {
          workbook = XLSX.read(decodedText, { type: 'string', cellDates: false, raw: false, cellText: true });
        } else {
          try {
            const utf8Text = new TextDecoder('utf-8').decode(buffer);
            if (/[가-힣]/.test(utf8Text)) {
              workbook = XLSX.read(utf8Text, { type: 'string', cellDates: false, raw: false, cellText: true });
            }
          } catch (e) {}

          if (!workbook) {
            workbook = XLSX.read(buffer, { type: 'array', cellDates: false, codepage: 949, raw: false, cellText: true });
          }
        }
      }

      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      let jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false }) as any[][];
      jsonRows = autoRepairRowEncoding(jsonRows);
      jsonRows = autoRepairAccountAndBankCodes(jsonRows);
      return jsonRows;
    } catch (parseErr: any) {
      console.warn('[ExcelSync] Standard XLSX read failed, attempting server password decryption:', parseErr.message);

      // 암호화된 파일 복호화 시도 (기본 비밀번호: 1111)
      let currentPw = password || deliveryPassword || '1111';
      try {
        const decryptedRows = await decryptExcelViaServer(file, currentPw);
        if (decryptedRows && decryptedRows.length > 0) {
          return autoRepairAccountAndBankCodes(autoRepairRowEncoding(decryptedRows));
        }
      } catch (pwErr: any) {
        // 기본 비밀번호(1111)가 맞지 않는 경우 사용자에게 직접 물어보기
        const promptPw = window.prompt(`[${file.name}] 파일이 암호화되어 있습니다.\n비밀번호를 입력해 주세요:`, currentPw);
        if (!promptPw) {
          throw new Error('암호화된 엑셀 파일의 비밀번호가 입력되지 않았습니다.');
        }
        setDeliveryPassword(promptPw);
        const retryRows = await decryptExcelViaServer(file, promptPw);
        return autoRepairAccountAndBankCodes(autoRepairRowEncoding(retryRows));
      }

      throw parseErr;
    }
  };

  // 계약원장 파일 선택 핸들러
  const handleContractFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsLoading(true);
      setLoadingText('계약원장 엑셀을 읽고 분석하는 중...');
      const rows = await parseExcelFile(file);
      if (!rows || rows.length < 2) {
        alert('엑셀에 데이터가 없거나 올바른 형식이 아닙니다.');
        return;
      }
      setContractFile(file);
      setContractFileName(file.name);
      setContractRows(rows);
      setPreviewStats(null);
      setCompletedResult(null);
    } catch (err: any) {
      console.error(err);
      alert('파일을 읽는 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setIsLoading(false);
      if (contractInputRef.current) contractInputRef.current.value = '';
    }
  };

  // 여러 엑셀 테이블을 헤더 이름 기반으로 자동 매핑하여 단일 테이블로 병합
  const mergeExcelTables = (tables: { fileName: string; rows: any[][] }[]) => {
    if (!tables || tables.length === 0) {
      return { combinedRows: null, filesInfo: [] };
    }

    const masterHeaders: string[] = [];
    const headerMap = new Map<string, number>();

    // 1. 모든 파일의 헤더를 수집하여 통합 마스터 헤더 생성
    for (const { rows } of tables) {
      if (!rows || rows.length === 0) continue;
      const hRow = rows[0] || [];
      for (let c = 0; c < hRow.length; c++) {
        const colName = String(hRow[c] || '').trim();
        if (colName && !headerMap.has(colName)) {
          headerMap.set(colName, masterHeaders.length);
          masterHeaders.push(colName);
        }
      }
    }

    // 2. 각 파일의 행 데이터를 마스터 헤더에 맞추어 재배치
    const combinedDataRows: any[][] = [];
    const filesInfo: DeliveryFileInfo[] = [];

    for (const { fileName, rows } of tables) {
      if (!rows || rows.length < 2) continue;
      const hRow = rows[0] || [];
      const colToMasterIdx: number[] = [];
      for (let c = 0; c < hRow.length; c++) {
        const colName = String(hRow[c] || '').trim();
        colToMasterIdx[c] = colName ? (headerMap.get(colName) ?? -1) : -1;
      }

      let count = 0;
      for (let r = 1; r < rows.length; r++) {
        const srcRow = rows[r];
        const hasValue = srcRow.some((val: any) => val !== null && val !== undefined && String(val).trim() !== '');
        if (!hasValue) continue;

        const newRow = new Array(masterHeaders.length).fill('');
        for (let c = 0; c < srcRow.length; c++) {
          const mIdx = colToMasterIdx[c];
          if (mIdx !== -1 && mIdx !== undefined) {
            newRow[mIdx] = srcRow[c] !== undefined && srcRow[c] !== null ? srcRow[c] : '';
          }
        }
        combinedDataRows.push(newRow);
        count++;
      }

      filesInfo.push({
        name: fileName,
        rowCount: count
      });
    }

    return {
      combinedRows: combinedDataRows.length > 0 ? [masterHeaders, ...combinedDataRows] : null,
      filesInfo
    };
  };

  // 배송데이터 파일(들) 선택 핸들러 (다중 파일 지원)
  const handleDeliveryFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    try {
      setIsLoading(true);
      const newTables = [...deliveryFileTables];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        setLoadingText(`배송데이터 [${file.name}] 읽는 중 (${i + 1}/${fileList.length})...`);
        const rows = await parseExcelFile(file);
        if (rows && rows.length >= 2) {
          // 이미 같은 파일명이 있으면 교체, 없으면 추가
          const existingIdx = newTables.findIndex(t => t.fileName === file.name);
          if (existingIdx !== -1) {
            newTables[existingIdx] = { fileName: file.name, rows };
          } else {
            newTables.push({ fileName: file.name, rows });
          }
        }
      }

      const { combinedRows, filesInfo } = mergeExcelTables(newTables);
      setDeliveryFileTables(newTables);
      setDeliveryFilesInfo(filesInfo);
      setDeliveryRows(combinedRows);
      setPreviewStats(null);
      setCompletedResult(null);
    } catch (err: any) {
      console.error(err);
      alert('배송데이터 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setIsLoading(false);
      if (deliveryInputRef.current) deliveryInputRef.current.value = '';
    }
  };

  // 특정 배송 파일 제거 핸들러
  const handleRemoveDeliveryFile = (fileName: string) => {
    const updatedTables = deliveryFileTables.filter(t => t.fileName !== fileName);
    const { combinedRows, filesInfo } = mergeExcelTables(updatedTables);
    setDeliveryFileTables(updatedTables);
    setDeliveryFilesInfo(filesInfo);
    setDeliveryRows(combinedRows);
    setPreviewStats(null);
    setCompletedResult(null);
  };

  // 배송데이터 전체 비우기 핸들러
  const handleClearDeliveryFiles = () => {
    setDeliveryFileTables([]);
    setDeliveryFilesInfo([]);
    setDeliveryRows(null);
    setPreviewStats(null);
    setCompletedResult(null);
  };

  // 미리보기(Dry-run) 실행
  const handlePreview = async () => {
    if (!contractRows && !deliveryRows) {
      alert('계약원장 엑셀 또는 배송데이터 엑셀 중 하나 이상을 먼저 업로드해 주세요.');
      return;
    }

    setIsLoading(true);
    setLoadingText('기존 관리대장 데이터와 대조하여 시뮬레이션을 실행하는 중...');
    try {
      const res = await fetch('/api/sheets/excel-sync/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractRows,
          deliveryRows,
          previewOnly: true,
          operator: currentUser?.username || '관리자'
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || '미리보기 분석 실패');
      }

      const data = await res.json();
      setPreviewStats(data.stats);
      setCompletedResult(null);
    } catch (err: any) {
      console.error(err);
      alert('미리보기 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 계약원장 엑셀을 구글 시트 [시트1] 탭에 스마트 병합(기존 보존 + 회원번호 기준 덮어쓰기 & 신규 추가) 단독 실행
  const handleDirectOverwriteSheet1 = async () => {
    if (!contractRows || contractRows.length < 2) {
      alert('계약원장 엑셀 파일이 준비되지 않았습니다.');
      return;
    }

    const confirmMsg = `[안전 확인] 구글 시트 [시트1] 탭의 기존 데이터를 100% 보존하면서, 업로드된 계약원장 (${(contractRows.length - 1).toLocaleString()}건)의 동일 회원번호는 최신 정보로 덮어쓰고(갱신), 신규 회원번호는 추가 등록하시겠습니까?`;
    const isConfirmed = (window as any).customConfirm
      ? await (window as any).customConfirm(confirmMsg, '시트1 스마트 병합 등록')
      : window.confirm(confirmMsg);

    if (!isConfirmed) return;

    setIsLoading(true);
    setLoadingText('구글 시트 [시트1] 탭에 기존 데이터를 보존하며 스마트 병합하는 중...');

    try {
      const res = await fetch('/api/sheets/excel-sync/overwrite-sheet1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractRows })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '시트1 병합 실패');
      }

      const data = await res.json();
      alert(`✓ 구글 시트 [시트1] 탭에 성공적으로 병합되었습니다!\n\n` +
        `• 기존 유지 데이터: ${(data.existingCount || 0).toLocaleString()}건\n` +
        `• 최신 정보 덮어쓰기(갱신): ${(data.updatedCount || 0).toLocaleString()}건\n` +
        `• 신규 계약 추가: ${(data.newCount || 0).toLocaleString()}건\n` +
        `(최종 총계: ${data.overwrittenCount.toLocaleString()}행)`
      );
    } catch (err: any) {
      console.error('[Direct Overwrite Sheet1 Error]', err);
      alert('시트1 등록 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 사원리스트 파일 선택 핸들러
  const handleEmployeeFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsLoading(true);
      setLoadingText(`사원리스트 파일 [${file.name}] 읽는 중...`);
      const rows = await parseExcelFile(file);
      if (!rows || rows.length < 2) {
        throw new Error('유효한 데이터 행이 없는 사원리스트 파일입니다.');
      }

      setEmployeeFile(file);
      setEmployeeRows(rows);
      setEmployeeFileName(file.name);
      setEmployeeActiveCount(rows.length - 1);
    } catch (err: any) {
      console.error(err);
      alert('사원리스트 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setIsLoading(false);
      if (employeeInputRef.current) employeeInputRef.current.value = '';
    }
  };

  // 사원리스트 스마트 병합 실행 (기존 보존 + 사원코드 기준 덮어쓰기 & 신규 추가)
  const handleDirectOverwriteEmployees = async () => {
    if (!employeeRows || employeeRows.length < 2) {
      alert('사원리스트 엑셀 파일이 준비되지 않았습니다.');
      return;
    }

    const totalCount = employeeRows.length - 1;
    const confirmMsg = `[안전 확인] 구글 시트 [사원리스트] 탭의 기존 사원 데이터를 100% 보존하면서, 업로드된 사원 명단 (${totalCount.toLocaleString()}건)의 동일 사원은 최신 정보로 덮어쓰고(갱신), 신규 사원은 추가 등록하시겠습니까?`;

    const isConfirmed = (window as any).customConfirm
      ? await (window as any).customConfirm(confirmMsg, '사원리스트 스마트 병합 등록')
      : window.confirm(confirmMsg);

    if (!isConfirmed) return;

    setIsLoading(true);
    setLoadingText('구글 시트 [사원리스트] 탭에 기존 사원 데이터를 보존하며 스마트 병합하는 중...');

    try {
      const res = await fetch('/api/sheets/excel-sync/overwrite-employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeRows })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '사원리스트 스마트 병합 실패');
      }

      const data = await res.json();
      alert(`✓ 구글 시트 [사원리스트] 탭에 성공적으로 병합되었습니다!\n\n` +
        `• 기존 유지 사원: ${(data.existingCount || 0).toLocaleString()}명\n` +
        `• 최신 정보 덮어쓰기(갱신): ${(data.updatedCount || 0).toLocaleString()}명\n` +
        `• 신규 사원 추가: ${(data.newCount || 0).toLocaleString()}명\n` +
        `(최종 총계: ${data.totalCount.toLocaleString()}명)`
      );
    } catch (err: any) {
      console.error('[Direct Smart Merge Employees Error]', err);
      alert('사원리스트 등록 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 수기발주 파일 선택 핸들러
  const handleManualOrderFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsLoading(true);
      setLoadingText(`수기발주 파일 [${file.name}] 읽는 중...`);
      const rows = await parseExcelFile(file);
      if (!rows || rows.length < 2) {
        throw new Error('유효한 데이터 행이 없는 수기발주 파일입니다.');
      }

      setManualOrderFile(file);
      setManualOrderRows(rows);
      setManualOrderFileName(file.name);
    } catch (err: any) {
      console.error(err);
      alert('수기발주 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setIsLoading(false);
      if (manualOrderInputRef.current) manualOrderInputRef.current.value = '';
    }
  };

  // 수기발주 즉시 덮어쓰기 실행
  const handleDirectOverwriteManualOrders = async () => {
    if (!manualOrderRows || manualOrderRows.length < 2) {
      alert('수기발주 엑셀 파일이 준비되지 않았습니다.');
      return;
    }

    const confirmMsg = `[안전 확인] 구글 시트 [수기발주] 탭에 업로드된 수기발주 ${(manualOrderRows.length - 1).toLocaleString()}건을 지금 즉시 등록(덮어쓰기)하시겠습니까?`;

    const isConfirmed = (window as any).customConfirm
      ? await (window as any).customConfirm(confirmMsg, '수기발주 즉시 등록')
      : window.confirm(confirmMsg);

    if (!isConfirmed) return;

    setIsLoading(true);
    setLoadingText('구글 시트 [수기발주] 탭에 즉시 등록(덮어쓰기)하는 중...');

    try {
      const res = await fetch('/api/sheets/excel-sync/overwrite-manual-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualOrderRows })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '수기발주 덮어쓰기 실패');
      }

      const data = await res.json();
      alert(`✓ 구글 시트 [수기발주] 탭에 총 ${(data.overwrittenCount - 1).toLocaleString()}건의 발주 데이터가 성공적으로 등록되었습니다!`);
    } catch (err: any) {
      console.error('[Direct Overwrite Manual Orders Error]', err);
      alert('수기발주 등록 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 관리대장 시트에 실제 안전 반영
  const handleExecuteSync = async () => {
    if (!contractRows && !deliveryRows) {
      alert('업로드된 엑셀 파일이 없습니다.');
      return;
    }

    const confirmMsg = `[안전 확인] 관리대장 시트에 전산 엑셀 데이터를 동기화하시겠습니까?\n\n` +
      `• 자동 백업 생성: ${autoBackup ? '예 (권장)' : '아니오'}\n` +
      `• 기존 수기 계약상태(해약/취소) 및 선지급일자: 100% 안전 보존\n\n` +
      `확인을 누르시면 즉시 구글 시트에 안전하게 반영됩니다.`;

    const isConfirmed = (window as any).customConfirm
      ? await (window as any).customConfirm(confirmMsg, '관리대장 엑셀 동기화 실행')
      : window.confirm(confirmMsg);

    if (!isConfirmed) return;

    setIsLoading(true);
    setLoadingText(autoBackup ? '현재 관리대장 시트를 백업하고 동기화하는 중...' : '관리대장 시트를 동기화하는 중...');

    try {
      const res = await fetch('/api/sheets/excel-sync/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractRows,
          deliveryRows,
          previewOnly: false,
          autoBackup,
          operator: currentUser?.username || '관리자'
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || '동기화 반영 실패');
      }

      const data = await res.json();
      setCompletedResult({
        backupTitle: data.backupTitle,
        sheet1OverwrittenCount: data.sheet1OverwrittenCount,
        sheet1UpdatedCount: data.sheet1UpdatedCount,
        sheet1NewCount: data.sheet1NewCount,
        sheet1ExistingCount: data.sheet1ExistingCount,
        sheet1Error: data.sheet1Error,
        deliveryOverwrittenCount: data.deliveryOverwrittenCount,
        deliveryUpdatedCount: data.deliveryUpdatedCount,
        deliveryNewCount: data.deliveryNewCount,
        deliveryExistingCount: data.deliveryExistingCount,
        deliveryError: data.deliveryError,
        filterAndFormatApplied: data.filterAndFormatApplied,
        filterAndFormatError: data.filterAndFormatError,
        stats: data.stats
      });

      // 🌟 [요구사항 3] 동기화 결과 alert 요약 팝업
      let successDetailMsg = `✓ 관리대장 구글 시트 동기화가 성공적으로 완료되었습니다!\n\n`;
      if (contractRows) {
        successDetailMsg += `• 신규 계약: ${data.stats.newContractCount.toLocaleString()}건 추가\n• 기존 계약 갱신: ${data.stats.updatedContractCount.toLocaleString()}건 최신화\n`;
        if (data.sheet1OverwrittenCount) {
          successDetailMsg += `• [시트1] 기존 보존 스마트 병합 (신규 +${data.sheet1NewCount || 0}건, 갱신 ${data.sheet1UpdatedCount || 0}건)\n`;
        }
      }
      if (deliveryRows) {
        successDetailMsg += `• 배송완료 전환: ${data.stats.deliveryCompletedCount.toLocaleString()}건 완료\n• 배송예정일 매칭: ${data.stats.deliveryExpectedCount.toLocaleString()}건\n`;
        if (data.deliveryOverwrittenCount) {
          successDetailMsg += `• [배송데이터] 스마트 병합 (신규 +${data.deliveryNewCount || 0}건, 갱신 ${data.deliveryUpdatedCount || 0}건)\n`;
        }
      }
      alert(successDetailMsg);

      if (data.sheet1Error) {
        alert(`[경고] 관리대장은 동기화되었으나, '시트1' 시트 병합 중 오류가 발생했습니다: ${data.sheet1Error}`);
      }

      // 메인 ERP 데이터 자동 리로드
      await onSyncSuccess();
    } catch (err: any) {
      console.error(err);
      alert('동기화 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 초기화
  const handleReset = () => {
    setContractFile(null);
    setContractRows(null);
    setContractFileName('');
    setDeliveryFileTables([]);
    setDeliveryFilesInfo([]);
    setDeliveryRows(null);
    setEmployeeFile(null);
    setEmployeeRows(null);
    setEmployeeFileName('');
    setEmployeeActiveCount(0);
    setManualOrderFile(null);
    setManualOrderRows(null);
    setManualOrderFileName('');
    setPreviewStats(null);
    setCompletedResult(null);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
      {/* 배경 블러 오버레이 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
      />

      {/* 모달 창 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        className="relative bg-white w-full max-w-4xl max-h-[92vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-100 z-10"
      >
        {/* 헤더 */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-400/30 flex items-center justify-center">
              <FileSpreadsheet size={20} />
            </div>
            <h3 className="text-base font-black tracking-tight">전산 엑셀 직접 업로드 & 관리대장 동기화</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="닫기"
          >
            <X size={18} />
          </button>
        </div>

        {/* 바디 컨텐츠 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 4개 파일 업로드 2x2 그리드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* 1. 계약 원장 카드 */}
            <div className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
              contractRows ? 'bg-emerald-50/50 border-emerald-300' : 'bg-slate-50/70 border-slate-200'
            }`}>
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${contractRows ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                      <FileText size={16} />
                    </div>
                    <h4 className="text-sm font-black text-slate-800">1. 계약 원장</h4>
                  </div>
                  {contractRows && (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-lg border border-emerald-200">
                      총 {(contractRows.length - 1).toLocaleString()}건
                    </span>
                  )}
                </div>

                {contractRows && (
                  <div className="p-2.5 bg-white rounded-xl border border-emerald-200 text-xs mb-2.5 shadow-2xs flex items-center justify-between">
                    <span className="font-bold text-slate-800 truncate mr-2" title={contractFileName}>
                      📄 {contractFileName}
                    </span>
                    <span className="text-emerald-700 font-bold text-[11px] shrink-0">
                      {(contractRows.length - 1).toLocaleString()}건 준비됨
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-2 space-y-1.5">
                <input
                  type="file"
                  ref={contractInputRef}
                  accept=".xlsx, .xls, .csv"
                  onChange={handleContractFileChange}
                  className="hidden"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => contractInputRef.current?.click()}
                    disabled={isLoading}
                    className="flex-1 py-2 px-3 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Upload size={13} />
                    {contractRows ? '파일 변경' : '계약원장 파일 선택'}
                  </button>
                  {contractRows && (
                    <button
                      type="button"
                      onClick={() => { setContractFile(null); setContractRows(null); setContractFileName(''); setPreviewStats(null); }}
                      className="px-2.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      취소
                    </button>
                  )}
                </div>

                {contractRows && (
                  <button
                    type="button"
                    onClick={handleDirectOverwriteSheet1}
                    disabled={isLoading}
                    className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Database size={13} />
                    <span>[시트1] 탭에 즉시 스마트 병합 등록</span>
                  </button>
                )}
              </div>
            </div>

            {/* 2. 배송 데이터 카드 */}
            <div className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
              deliveryRows ? 'bg-blue-50/50 border-blue-300' : 'bg-slate-50/70 border-slate-200'
            }`}>
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${deliveryRows ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                      <Truck size={16} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-sm font-black text-slate-800">2. 배송 데이터</h4>
                      <span className="px-1.5 py-0.2 bg-blue-100 text-blue-700 text-[10px] font-bold rounded">
                        복수 가능
                      </span>
                    </div>
                  </div>
                  {deliveryRows && (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[11px] font-bold rounded-lg border border-blue-200">
                      {deliveryFilesInfo.length}개 파일 ({(deliveryRows.length - 1).toLocaleString()}건)
                    </span>
                  )}
                </div>

                {deliveryRows && deliveryFilesInfo.length > 0 && (
                  <div className="p-2.5 bg-white rounded-xl border border-blue-200 text-xs mb-2.5 shadow-2xs space-y-1.5">
                    <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                      {deliveryFilesInfo.map((fi, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between py-0.5 px-2 rounded bg-slate-50 border border-slate-100 text-[11px]"
                        >
                          <span className="font-medium text-slate-700 truncate max-w-[190px]" title={fi.name}>
                            📄 {fi.name}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-slate-400 font-mono text-[10px]">+{fi.rowCount.toLocaleString()}건</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveDeliveryFile(fi.name)}
                              className="text-slate-400 hover:text-rose-500 cursor-pointer"
                            >
                              <X size={11} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-2 space-y-1.5">
                <div className="px-2.5 py-1 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1 text-slate-600 text-[11px]">
                    <Lock size={12} className="text-slate-400" />
                    <span>파일 암호:</span>
                  </div>
                  <input
                    type="text"
                    value={deliveryPassword}
                    onChange={e => setDeliveryPassword(e.target.value)}
                    placeholder="1111"
                    className="w-16 px-1.5 py-0.5 text-center font-mono font-bold text-xs bg-slate-50 border border-slate-200 rounded text-slate-800 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <input
                  type="file"
                  ref={deliveryInputRef}
                  accept=".xlsx, .xls, .csv"
                  multiple
                  onChange={handleDeliveryFilesChange}
                  className="hidden"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => deliveryInputRef.current?.click()}
                    disabled={isLoading}
                    className="flex-1 py-2 px-3 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Upload size={13} />
                    {deliveryRows ? '+ 파일 추가' : '배송데이터 파일 선택'}
                  </button>
                  {deliveryRows && (
                    <button
                      type="button"
                      onClick={handleClearDeliveryFiles}
                      className="px-2.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      비우기
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 3. 사원 리스트 카드 */}
            <div className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
              employeeRows ? 'bg-amber-50/50 border-amber-300' : 'bg-slate-50/70 border-slate-200'
            }`}>
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${employeeRows ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                      <UserCheck size={16} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-sm font-black text-slate-800">3. 사원 리스트</h4>
                    </div>
                  </div>
                  {employeeRows && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[11px] font-bold rounded-lg border border-amber-200">
                      총 {(employeeRows.length - 1).toLocaleString()}건
                    </span>
                  )}
                </div>

                {employeeRows && (
                  <div className="p-2.5 bg-white rounded-xl border border-amber-200 text-xs mb-2.5 shadow-2xs flex items-center justify-between">
                    <span className="font-bold text-slate-800 truncate mr-2" title={employeeFileName}>
                      📄 {employeeFileName}
                    </span>
                    <span className="text-amber-700 font-bold text-[11px] shrink-0">
                      {(employeeRows.length - 1).toLocaleString()}건
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-2 space-y-1.5">
                <input
                  type="file"
                  ref={employeeInputRef}
                  accept=".xlsx, .xls, .csv"
                  onChange={handleEmployeeFileChange}
                  className="hidden"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => employeeInputRef.current?.click()}
                    disabled={isLoading}
                    className="flex-1 py-2 px-3 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Upload size={13} />
                    {employeeRows ? '파일 변경' : '사원리스트 파일 선택'}
                  </button>
                  {employeeRows && (
                    <button
                      type="button"
                      onClick={() => { setEmployeeFile(null); setEmployeeRows(null); setEmployeeFileName(''); setEmployeeActiveCount(0); }}
                      className="px-2.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      취소
                    </button>
                  )}
                </div>

                {employeeRows && (
                  <button
                    type="button"
                    onClick={handleDirectOverwriteEmployees}
                    disabled={isLoading}
                    className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <UserCheck size={13} />
                    <span>[사원리스트] 탭에 즉시 스마트 병합 등록 ({(employeeRows.length - 1).toLocaleString()}건)</span>
                  </button>
                )}
              </div>
            </div>

            {/* 4. 수기 발주 카드 */}
            <div className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
              manualOrderRows ? 'bg-teal-50/50 border-teal-300' : 'bg-slate-50/70 border-slate-200'
            }`}>
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${manualOrderRows ? 'bg-teal-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                      <Package size={16} />
                    </div>
                    <h4 className="text-sm font-black text-slate-800">4. 수기 발주</h4>
                  </div>
                  {manualOrderRows && (
                    <span className="px-2 py-0.5 bg-teal-100 text-teal-800 text-[11px] font-bold rounded-lg border border-teal-200">
                      총 {(manualOrderRows.length - 1).toLocaleString()}건
                    </span>
                  )}
                </div>

                {manualOrderRows && (
                  <div className="p-2.5 bg-white rounded-xl border border-teal-200 text-xs mb-2.5 shadow-2xs flex items-center justify-between">
                    <span className="font-bold text-slate-800 truncate mr-2" title={manualOrderFileName}>
                      📄 {manualOrderFileName}
                    </span>
                    <span className="text-teal-700 font-bold text-[11px] shrink-0">
                      {(manualOrderRows.length - 1).toLocaleString()}건 준비됨
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-2 space-y-1.5">
                <input
                  type="file"
                  ref={manualOrderInputRef}
                  accept=".xlsx, .xls, .csv"
                  onChange={handleManualOrderFileChange}
                  className="hidden"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => manualOrderInputRef.current?.click()}
                    disabled={isLoading}
                    className="flex-1 py-2 px-3 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Upload size={13} />
                    {manualOrderRows ? '파일 변경' : '수기발주 파일 선택'}
                  </button>
                  {manualOrderRows && (
                    <button
                      type="button"
                      onClick={() => { setManualOrderFile(null); setManualOrderRows(null); setManualOrderFileName(''); }}
                      className="px-2.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      취소
                    </button>
                  )}
                </div>

                {manualOrderRows && (
                  <button
                    type="button"
                    onClick={handleDirectOverwriteManualOrders}
                    disabled={isLoading}
                    className="w-full py-2 px-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-black transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Package size={13} />
                    <span>[수기발주] 탭에 지금 즉시 등록</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 옵션 바 */}
          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
            <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoBackup}
                onChange={e => setAutoBackup(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span>관리대장 자동 백업 탭 생성</span>
            </label>
            {(contractRows || deliveryRows || employeeRows || manualOrderRows) && (
              <button
                type="button"
                onClick={handleReset}
                className="text-slate-400 hover:text-rose-600 text-xs font-bold transition-colors cursor-pointer"
              >
                전체 초기화
              </button>
            )}
          </div>

          {/* 4. 미리보기(분석 결과) 표시 섹션 */}
          {previewStats && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-5 bg-gradient-to-br from-slate-50 to-indigo-50/40 rounded-2xl border border-indigo-200 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Sparkles size={16} className="text-indigo-600" />
                  동기화 시뮬레이션 분석 결과
                </h4>
                <span className="text-xs font-bold text-slate-500">
                  반영 후 총 관리대장: <strong className="text-indigo-600 text-sm">{previewStats.finalTotalCount}건</strong>
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">기존 관리대장</span>
                  <span className="text-base font-black text-slate-800">{previewStats.totalExistingCount}건</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-emerald-200 shadow-2xs">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase block mb-1">신규 계약 추가</span>
                  <span className="text-base font-black text-emerald-600">+{previewStats.newContractCount}건</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-blue-200 shadow-2xs">
                  <span className="text-[10px] font-bold text-blue-600 uppercase block mb-1">배송완료 반영</span>
                  <span className="text-base font-black text-blue-600">{previewStats.deliveryCompletedCount}건</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-purple-200 shadow-2xs">
                  <span className="text-[10px] font-bold text-purple-600 uppercase block mb-1">배송예정일 반영</span>
                  <span className="text-base font-black text-purple-600">{previewStats.deliveryExpectedCount}건</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
                <div className="p-3 bg-white/80 rounded-xl border border-slate-200 flex items-center justify-between">
                  <span className="text-slate-600">🛡️ 보존된 수기 계약상태 (해약/취소):</span>
                  <span className="font-black text-rose-600">{previewStats.preservedManualStatusCount}건 안전 보존</span>
                </div>
                <div className="p-3 bg-white/80 rounded-xl border border-slate-200 flex items-center justify-between">
                  <span className="text-slate-600">🔒 보존된 수기 선지급일자:</span>
                  <span className="font-black text-amber-600">{previewStats.preservedManualFeeDateCount}건 안전 보존</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* 5. 동기화 완료 리포트 */}
          {completedResult && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-5 bg-emerald-50 rounded-2xl border border-emerald-300 space-y-3"
            >
              <div className="flex items-center gap-2 text-emerald-900 font-black text-base">
                <CheckCircle size={20} className="text-emerald-600" />
                관리대장 구글 시트 동기화가 완벽하게 성공했습니다!
              </div>
              <p className="text-xs text-emerald-800 leading-relaxed">
                총 <strong>{completedResult.stats.finalTotalCount.toLocaleString()}건</strong>의 데이터가 구글 시트 [관리대장]에 최신화되었으며, ERP 웹사이트 화면 데이터도 자동으로 새로고침되었습니다.
              </p>

              {/* 핵심 동기화 결과 통계 카드 (신규계약 건수, 배송완료 전환 건수 등) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center my-3">
                <div className="p-3 bg-white rounded-xl border border-emerald-300 shadow-xs">
                  <span className="text-[11px] font-bold text-emerald-700 uppercase block mb-1">신규 계약 등록</span>
                  <span className="text-xl font-black text-emerald-600">+{completedResult.stats.newContractCount.toLocaleString()}건</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-blue-300 shadow-xs">
                  <span className="text-[11px] font-bold text-blue-700 uppercase block mb-1">배송완료 전환</span>
                  <span className="text-xl font-black text-blue-600">{completedResult.stats.deliveryCompletedCount.toLocaleString()}건</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-purple-300 shadow-xs">
                  <span className="text-[11px] font-bold text-purple-700 uppercase block mb-1">배송예정일 매칭</span>
                  <span className="text-xl font-black text-purple-600">{completedResult.stats.deliveryExpectedCount.toLocaleString()}건</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-slate-300 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-600 uppercase block mb-1">최종 관리대장 총계</span>
                  <span className="text-xl font-black text-slate-800">{completedResult.stats.finalTotalCount.toLocaleString()}건</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {completedResult.sheet1OverwrittenCount !== undefined && completedResult.sheet1OverwrittenCount > 0 && (
                  <div className="px-3 py-1.5 bg-white text-blue-800 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-blue-200 shadow-2xs">
                    <Database size={13} className="text-blue-600 shrink-0" />
                    <span>
                      [시트1] 스마트 병합 완료 (신규 +{completedResult.sheet1NewCount?.toLocaleString() || 0}건 / 갱신 {completedResult.sheet1UpdatedCount?.toLocaleString() || 0}건 / 총 {completedResult.sheet1OverwrittenCount.toLocaleString()}행)
                    </span>
                  </div>
                )}
                {completedResult.sheet1Error && (
                  <div className="px-3 py-1.5 bg-rose-50 text-rose-800 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-rose-200 shadow-2xs">
                    <AlertTriangle size={13} className="text-rose-600 shrink-0" />
                    <span>[시트1 오류] {completedResult.sheet1Error}</span>
                  </div>
                )}
                {completedResult.deliveryOverwrittenCount !== undefined && completedResult.deliveryOverwrittenCount > 0 && (
                  <div className="px-3 py-1.5 bg-white text-indigo-800 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-indigo-200 shadow-2xs">
                    <Truck size={13} className="text-indigo-600 shrink-0" />
                    <span>
                      [배송데이터] 스마트 병합 완료 (신규 +{completedResult.deliveryNewCount?.toLocaleString() || 0}건 / 갱신 {completedResult.deliveryUpdatedCount?.toLocaleString() || 0}건 / 총 {completedResult.deliveryOverwrittenCount.toLocaleString()}행)
                    </span>
                  </div>
                )}
                {completedResult.deliveryError && (
                  <div className="px-3 py-1.5 bg-rose-50 text-rose-800 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-rose-200 shadow-2xs">
                    <AlertTriangle size={13} className="text-rose-600 shrink-0" />
                    <span>[배송데이터 오류] {completedResult.deliveryError}</span>
                  </div>
                )}
                {completedResult.filterAndFormatApplied && (
                  <div className="px-3 py-1.5 bg-white text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-emerald-200 shadow-2xs">
                    <CheckCircle size={13} className="text-emerald-600 shrink-0" />
                    <span>[관리대장] 1행 필터 재설정(마지막 행 포함) 및 상태/배송 서식양식 풀기·재설정 완료</span>
                  </div>
                )}
                {completedResult.filterAndFormatError && (
                  <div className="px-3 py-1.5 bg-amber-50 text-amber-800 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-amber-200 shadow-2xs">
                    <AlertTriangle size={13} className="text-amber-600 shrink-0" />
                    <span>[필터/서식 안내] {completedResult.filterAndFormatError}</span>
                  </div>
                )}
              </div>
              {completedResult.backupTitle && (
                <div className="p-3 bg-white rounded-xl border border-emerald-200 text-xs flex items-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
                  <span>
                    안전 백업 시트 생성됨: <strong className="font-mono text-emerald-700">{completedResult.backupTitle}</strong>
                  </span>
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* 푸터 액션 버튼 */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              {completedResult ? '닫기' : '취소'}
            </button>

            {!completedResult && (
              <>
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={isLoading || (!contractRows && !deliveryRows)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                  변경사항 미리보기 (시뮬레이션)
                </button>

                <button
                  type="button"
                  onClick={handleExecuteSync}
                  disabled={isLoading || (!contractRows && !deliveryRows)}
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 disabled:from-indigo-300 disabled:to-blue-300 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-indigo-500/20 flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles size={14} />
                  관리대장에 안전하게 반영하기
                </button>
              </>
            )}
          </div>
        </div>

        {/* 로딩 인디케이터 오버레이 */}
        {isLoading && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center gap-3 z-30">
            <div className="animate-spin w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full" />
            <p className="text-sm font-bold text-slate-800 animate-pulse">{loadingText || '처리 중입니다...'}</p>
          </div>
        )}
      </motion.div>
    </div>
  );
};

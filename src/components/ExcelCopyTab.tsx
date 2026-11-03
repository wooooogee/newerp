import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload,
  FileSpreadsheet,
  Copy,
  Check,
  CheckCheck,
  Trash2,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Settings,
  RotateCcw,
  Download,
  Save,
  FileText,
  Layers,
  Table,
  Columns,
  Grid,
  Edit2,
  Sparkles,
  HelpCircle,
  Filter,
  FilterX,
  ArrowRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Maximize2,
  Crosshair,
  ExternalLink,
  Sliders,
  CheckSquare,
  Square,
  X,
  ChevronDown
} from 'lucide-react';

// 열 인덱스 (0-based) -> 열 문자 (A, B, ... Z, AA, AB ...)
export function colIndexToLetter(col: number): string {
  let letter = '';
  let temp = col;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

// 열 문자 (A, B, AA...) -> 열 인덱스 (0-based)
export function letterToColIndex(str: string): number {
  const s = str.toUpperCase().trim().replace(/[^A-Z]/g, '');
  if (!s) return 0;
  let col = 0;
  for (let i = 0; i < s.length; i++) {
    col = col * 26 + (s.charCodeAt(i) - 64);
  }
  return Math.max(0, col - 1);
}

// 셀 좌표 (예: 'A1', 'B5') 파싱 -> { r, c } (0-based)
export function parseCellCoord(coord: string): { r: number; c: number } | null {
  const match = coord.trim().toUpperCase().match(/^([A-Z]+)([0-9]+)$/);
  if (!match) return null;
  const c = letterToColIndex(match[1]);
  const r = parseInt(match[2], 10) - 1;
  if (r < 0 || c < 0) return null;
  return { r, c };
}

// { r, c } -> 셀 좌표 문자열 (예: 'A1')
export function formatCellCoord(r: number, c: number): string {
  return `${colIndexToLetter(c)}${r + 1}`;
}

export interface CopyFieldItem {
  id: string;
  name: string;               // 필드 표시 이름 (예: 고객명, 연락처, 계약번호, 납부금액 등)
  posType: 'column' | 'cell'; // 'column': 행 탐색에 따라 바뀌는 열 기준 (예: A열), 'cell': 고정 셀 좌표 (예: B2)
  colLetter: string;          // 열 문자 (예: 'A', 'B', 'C')
  colIndex: number;           // 열 인덱스 (0-based)
  cellCoord: string;          // 고정 셀 좌표 (예: 'A1', 'B3')
  copied?: boolean;           // 최근 복사 완료 여부 (시각적 피드백)
}

export interface PresetTemplate {
  id: string;
  name: string;
  createdAt: string;
  fields: Array<{
    name: string;
    posType: 'column' | 'cell';
    colLetter: string;
    cellCoord: string;
  }>;
}

// 열별 필터 규칙
export interface ColumnFilterRule {
  textQuery: string;               // 텍스트 포함 검색
  selectedValues?: string[];       // 특정 고유값들만 선택된 경우
}

export type ColumnFiltersState = {
  [colIndex: number]: ColumnFilterRule;
};

export interface ColumnSortState {
  colIndex: number;
  direction: 'asc' | 'desc';
}

const PRESET_STORAGE_KEY = 'erp_excel_copy_presets_v1';

export const ExcelCopyTab: React.FC = () => {
  // 파일 및 시트 상태
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<number>(0);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [currentSheetName, setCurrentSheetName] = useState<string>('');
  const [workbookSheets, setWorkbookSheets] = useState<{ [sheetName: string]: any[][] }>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // 현재 시트의 2차원 데이터
  const sheetData = useMemo(() => {
    return workbookSheets[currentSheetName] || [];
  }, [workbookSheets, currentSheetName]);

  // 행 탐색 상태 (0-based, 데이터가 있을 때 보통 헤더 다음 행인 1부터 시작)
  const [activeRowIndex, setActiveRowIndex] = useState<number>(1);

  // 복사 필드 목록
  const [fields, setFields] = useState<CopyFieldItem[]>([]);

  // 시트에서 셀 위치 콕 찍기 모드 (지정할 대상 필드 ID)
  const [pickingTargetId, setPickingTargetId] = useState<string | null>(null);

  // 셀 값 직접 인라인 수정 상태 ({ r, c, val })
  const [editingCell, setEditingCell] = useState<{ r: number; c: number; text: string } | null>(null);

  // 뷰 레이아웃 모드 ('split': 분할 보기, 'cards': 원클릭 복사 카드만, 'grid': 스프레드시트만)
  const [layoutMode, setLayoutMode] = useState<'split' | 'cards' | 'grid'>('split');

  // 검색어 (스프레드시트 내 하이라이트 및 빠른 탐색)
  const [sheetSearch, setSheetSearch] = useState<string>('');

  // 복사 토스트 알림
  const [toastMessage, setToastMessage] = useState<{ title: string; value: string } | null>(null);

  // =================== 필터 및 정렬 상태 ===================
  // 열별 필터 조건 { [colIndex]: { textQuery, selectedValues } }
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>({});

  // 열별 정렬 상태
  const [sortState, setSortState] = useState<ColumnSortState | null>(null);

  // 열 필터 드롭다운 팝오버 열림 상태 (어느 열이 열렸는지)
  const [activeFilterCol, setActiveFilterCol] = useState<number | null>(null);

  // 열 하단 인라인 빠른 필터 입력행 표시 여부
  const [showQuickFilterRow, setShowQuickFilterRow] = useState<boolean>(true);

  // 프리셋 모달 상태
  const [isPresetModalOpen, setIsPresetModalOpen] = useState<boolean>(false);
  const [presetNameInput, setPresetNameInput] = useState<string>('');
  const [presets, setPresets] = useState<PresetTemplate[]>(() => {
    try {
      const stored = localStorage.getItem(PRESET_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return [
      {
        id: 'default-settle',
        name: '기본 정산/고객 복사 서식',
        createdAt: '2026-03-01',
        fields: [
          { name: '계약번호', posType: 'column', colLetter: 'A', cellCoord: 'A2' },
          { name: '고객명', posType: 'column', colLetter: 'B', cellCoord: 'B2' },
          { name: '연락처', posType: 'column', colLetter: 'C', cellCoord: 'C2' },
          { name: '상품명', posType: 'column', colLetter: 'D', cellCoord: 'D2' },
          { name: '금액', posType: 'column', colLetter: 'E', cellCoord: 'E2' },
          { name: '비고/메모', posType: 'column', colLetter: 'F', cellCoord: 'F2' }
        ]
      }
    ];
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 열 필터 팝오버 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(e.target as Node)) {
        setActiveFilterCol(null);
      }
    };
    if (activeFilterCol !== null) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeFilterCol]);

  // 프리셋 저장
  const savePresetsToStorage = (newPresets: PresetTemplate[]) => {
    setPresets(newPresets);
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(newPresets));
    } catch (e) {
      console.error('Failed to save presets', e);
    }
  };

  // 엑셀 파싱 헬퍼
  const handleFileUpload = async (file: File) => {
    setIsLoading(true);
    setFileName(file.name);
    setFileSize(file.size);
    setColumnFilters({});
    setSortState(null);

    try {
      const XLSX = (window as any).XLSX;
      if (!XLSX) {
        alert('XLSX 라이브러리를 불러올 수 없습니다. 브라우저를 새로고침해주세요.');
        setIsLoading(false);
        return;
      }

      const buffer = await file.arrayBuffer();

      // 워크북 읽기
      let workbook: any = null;
      try {
        workbook = XLSX.read(buffer, { type: 'array', cellDates: true, codepage: 949, raw: false, cellText: false });
      } catch (err) {
        try {
          const text = new TextDecoder('utf-8').decode(buffer);
          workbook = XLSX.read(text, { type: 'string', cellDates: true, raw: false, cellText: false });
        } catch (e2) {
          const euc = new TextDecoder('euc-kr').decode(buffer);
          workbook = XLSX.read(euc, { type: 'string', cellDates: true, raw: false, cellText: false });
        }
      }

      if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error('엑셀 시트를 찾을 수 없습니다.');
      }

      const parsedSheets: { [name: string]: any[][] } = {};
      workbook.SheetNames.forEach((sheetName: string) => {
        const ws = workbook.Sheets[sheetName];
        if (ws) {
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as any[][];
          parsedSheets[sheetName] = rows;
        }
      });

      setWorkbookSheets(parsedSheets);
      setSheetNames(workbook.SheetNames);

      const firstSheet = workbook.SheetNames[0];
      setCurrentSheetName(firstSheet);

      const firstSheetRows = parsedSheets[firstSheet] || [];
      const hasRows = firstSheetRows.length > 0;

      // 헤더 분석하여 복사 필드 자동 생성
      if (hasRows) {
        const headerRow = firstSheetRows[0] || [];
        const detectedFields: CopyFieldItem[] = [];

        // 최대 30개 열까지 헤더가 있는 열 자동 추가
        const colCount = Math.min(headerRow.length, 30);
        for (let c = 0; c < colCount; c++) {
          const headerVal = String(headerRow[c] ?? '').trim();
          if (headerVal) {
            const letter = colIndexToLetter(c);
            detectedFields.push({
              id: `field_${Date.now()}_${c}`,
              name: headerVal,
              posType: 'column',
              colLetter: letter,
              colIndex: c,
              cellCoord: `${letter}2`,
              copied: false
            });
          }
        }

        // 헤더가 없거나 모두 비어있으면 1~5개 기본 열 생성
        if (detectedFields.length === 0) {
          for (let c = 0; c < Math.min(colCount || 5, 8); c++) {
            const letter = colIndexToLetter(c);
            detectedFields.push({
              id: `field_${Date.now()}_${c}`,
              name: `${letter}열 데이터`,
              posType: 'column',
              colLetter: letter,
              colIndex: c,
              cellCoord: `${letter}2`,
              copied: false
            });
          }
        }

        setFields(detectedFields);
        setActiveRowIndex(firstSheetRows.length > 1 ? 1 : 0);
      }
    } catch (err: any) {
      console.error('엑셀 파싱 에러:', err);
      alert('엑셀 파일을 읽는 도중 오류가 발생했습니다: ' + (err.message || '알 수 없는 형식'));
    } finally {
      setIsLoading(false);
    }
  };

  // 클립보드 원클릭 복사
  const copyToClipboard = useCallback((text: string, title?: string, fieldId?: string) => {
    if (!text && text !== '0') {
      text = '';
    }
    const cleanText = String(text);

    navigator.clipboard.writeText(cleanText).then(() => {
      // 복사 완료 피드백
      if (fieldId) {
        setFields(prev =>
          prev.map(f => (f.id === fieldId ? { ...f, copied: true } : f))
        );
        setTimeout(() => {
          setFields(prev =>
            prev.map(f => (f.id === fieldId ? { ...f, copied: false } : f))
          );
        }, 1800);
      }

      setToastMessage({
        title: title || '복사 완료',
        value: cleanText.length > 40 ? cleanText.slice(0, 40) + '...' : cleanText
      });

      setTimeout(() => {
        setToastMessage(null);
      }, 2000);
    }).catch(err => {
      console.error('복사 실패:', err);
    });
  }, []);

  // 총 행 수
  const totalRowCount = sheetData.length;
  // 데이터 시작 행 (0행이 헤더이면 1, 0행뿐이면 0)
  const dataStartRow = totalRowCount > 1 ? 1 : 0;
  const totalDataRows = Math.max(0, totalRowCount - dataStartRow);

  // 최대 열 수 계산
  const maxColCount = useMemo(() => {
    let max = 0;
    const checkLimit = Math.min(sheetData.length, 100);
    for (let i = 0; i < checkLimit; i++) {
      if (sheetData[i]?.length > max) max = sheetData[i].length;
    }
    return Math.max(max, 10);
  }, [sheetData]);

  // =================== 필터 및 정렬 계산 로직 ===================
  // 필터가 적용된 유효 행 인덱스 목록
  const filteredRowIndices = useMemo(() => {
    if (!sheetData || sheetData.length === 0) return [];
    const indices: number[] = [];

    // 활성화된 필터 목록 추출
    const activeFilters = (Object.entries(columnFilters) as [string, ColumnFilterRule][]).filter(([_, rule]) => {
      if (!rule) return false;
      const hasQuery = Boolean(rule.textQuery && rule.textQuery.trim() !== '');
      const hasSelected = Boolean(rule.selectedValues && rule.selectedValues.length > 0);
      return hasQuery || hasSelected;
    });

    for (let r = dataStartRow; r < sheetData.length; r++) {
      const row = sheetData[r] || [];
      let isMatch = true;

      for (const [colStr, rule] of activeFilters) {
        const c = parseInt(colStr, 10);
        const cellRaw = row[c];
        const cellVal = String(cellRaw ?? '').trim();
        const displayVal = cellVal === '' ? '(빈 셀)' : cellVal;

        // 1. 텍스트 검색어 필터
        if (rule.textQuery && rule.textQuery.trim() !== '') {
          const q = rule.textQuery.trim().toLowerCase();
          if (!cellVal.toLowerCase().includes(q)) {
            isMatch = false;
            break;
          }
        }

        // 2. 고유값 선택 필터
        if (rule.selectedValues && rule.selectedValues.length > 0) {
          if (!rule.selectedValues.includes(displayVal)) {
            isMatch = false;
            break;
          }
        }
      }

      if (isMatch) {
        indices.push(r);
      }
    }

    // 정렬 수행
    if (sortState) {
      const { colIndex, direction } = sortState;
      indices.sort((a, b) => {
        const valA = String(sheetData[a]?.[colIndex] ?? '').trim();
        const valB = String(sheetData[b]?.[colIndex] ?? '').trim();

        const numA = parseFloat(valA.replace(/,/g, ''));
        const numB = parseFloat(valB.replace(/,/g, ''));
        if (!isNaN(numA) && !isNaN(numB) && !isNaN(Number(valA)) && !isNaN(Number(valB))) {
          return direction === 'asc' ? numA - numB : numB - numA;
        }

        return direction === 'asc' ? valA.localeCompare(valB, 'ko') : valB.localeCompare(valA, 'ko');
      });
    }

    return indices;
  }, [sheetData, columnFilters, sortState, dataStartRow]);

  // 활성 필터 개수
  const activeFilterCount = useMemo(() => {
    return (Object.values(columnFilters) as ColumnFilterRule[]).filter(r => {
      if (!r) return false;
      return (r.textQuery && r.textQuery.trim() !== '') || (r.selectedValues && r.selectedValues.length > 0);
    }).length;
  }, [columnFilters]);

  // 현재 필터된 행 목록 안에서 activeRowIndex의 위치
  const currentFilteredPosition = useMemo(() => {
    const idx = filteredRowIndices.indexOf(activeRowIndex);
    return idx >= 0 ? idx : 0;
  }, [filteredRowIndices, activeRowIndex]);

  // 필터가 변경되어 현재 activeRowIndex가 필터 결과에 없으면 필터의 첫 행으로 자동 이동
  useEffect(() => {
    if (filteredRowIndices.length > 0 && !filteredRowIndices.includes(activeRowIndex)) {
      setActiveRowIndex(filteredRowIndices[0]);
    }
  }, [filteredRowIndices, activeRowIndex]);

  // 특정 열의 고유값 목록 (카운트 포함) 추출
  const getColumnUniqueValues = useCallback((colIndex: number) => {
    const map = new Map<string, number>();
    for (let r = dataStartRow; r < sheetData.length; r++) {
      const val = String(sheetData[r]?.[colIndex] ?? '').trim();
      const displayVal = val === '' ? '(빈 셀)' : val;
      map.set(displayVal, (map.get(displayVal) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [sheetData, dataStartRow]);

  // 셀 값으로 즉시 필터 걸기 (원클릭 필터)
  const handleFilterByCellValue = (colIndex: number, cellVal: string) => {
    const displayVal = cellVal.trim() === '' ? '(빈 셀)' : cellVal.trim();
    setColumnFilters(prev => ({
      ...prev,
      [colIndex]: {
        textQuery: '',
        selectedValues: [displayVal]
      }
    }));
    setToastMessage({
      title: '셀 값으로 필터 적용',
      value: `${colIndexToLetter(colIndex)}열 = "${displayVal}"`
    });
  };

  // 특정 열 필터 해제
  const handleClearColumnFilter = (colIndex: number) => {
    setColumnFilters(prev => {
      const next = { ...prev };
      delete next[colIndex];
      return next;
    });
  };

  // 모든 필터 및 정렬 초기화
  const handleClearAllFilters = () => {
    setColumnFilters({});
    setSortState(null);
    setToastMessage({
      title: '필터 초기화',
      value: '모든 열 필터가 해제되었습니다.'
    });
  };

  // 정렬 토글 (asc -> desc -> none)
  const handleToggleSort = (colIndex: number) => {
    if (!sortState || sortState.colIndex !== colIndex) {
      setSortState({ colIndex, direction: 'asc' });
    } else if (sortState.direction === 'asc') {
      setSortState({ colIndex, direction: 'desc' });
    } else {
      setSortState(null);
    }
  };

  // 특정 필드의 현재 행 또는 지정 셀 값 계산
  const getFieldValue = useCallback((field: CopyFieldItem, rowIndex: number): string => {
    if (!sheetData || sheetData.length === 0) return '';

    if (field.posType === 'column') {
      const row = sheetData[rowIndex];
      if (!row) return '';
      const c = field.colIndex ?? letterToColIndex(field.colLetter);
      return String(row[c] ?? '').trim();
    } else {
      const parsed = parseCellCoord(field.cellCoord);
      if (!parsed) return '';
      const row = sheetData[parsed.r];
      if (!row) return '';
      return String(row[parsed.c] ?? '').trim();
    }
  }, [sheetData]);

  // 셀 위치 수정 핸들러
  const handleUpdateFieldPosition = (fieldId: string, newPositionStr: string) => {
    const raw = newPositionStr.trim().toUpperCase();

    setFields(prev =>
      prev.map(f => {
        if (f.id !== fieldId) return f;

        const cellCoordMatch = raw.match(/^([A-Z]+)([0-9]+)$/);
        if (cellCoordMatch) {
          const colL = cellCoordMatch[1];
          const colIdx = letterToColIndex(colL);
          return {
            ...f,
            posType: 'cell',
            cellCoord: raw,
            colLetter: colL,
            colIndex: colIdx
          };
        }

        const colOnlyMatch = raw.replace(/[^A-Z]/g, '');
        if (colOnlyMatch) {
          const colIdx = letterToColIndex(colOnlyMatch);
          return {
            ...f,
            posType: 'column',
            colLetter: colOnlyMatch,
            colIndex: colIdx,
            cellCoord: `${colOnlyMatch}${activeRowIndex + 1}`
          };
        }

        return f;
      })
    );
  };

  // 새 복사 필드 추가
  const handleAddField = () => {
    const nextCol = fields.length;
    const letter = colIndexToLetter(nextCol);
    const newField: CopyFieldItem = {
      id: `field_${Date.now()}`,
      name: `항목 ${fields.length + 1}`,
      posType: 'column',
      colLetter: letter,
      colIndex: nextCol,
      cellCoord: `${letter}${activeRowIndex + 1}`,
      copied: false
    };
    setFields(prev => [...prev, newField]);
  };

  // 복사 필드 삭제
  const handleDeleteField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
    if (pickingTargetId === id) setPickingTargetId(null);
  };

  // 필드 이름 변경
  const handleUpdateFieldName = (id: string, newName: string) => {
    setFields(prev =>
      prev.map(f => (f.id === id ? { ...f, name: newName } : f))
    );
  };

  // 스프레드시트에서 특정 셀 클릭 시
  const handleCellClick = (r: number, c: number, cellVal: any) => {
    const coordStr = formatCellCoord(r, c);
    const textVal = String(cellVal ?? '');

    // 1. 셀 콕 찍기 모드일 경우: 해당 필드의 위치로 저장
    if (pickingTargetId) {
      setFields(prev =>
        prev.map(f => {
          if (f.id !== pickingTargetId) return f;
          return {
            ...f,
            posType: 'cell',
            cellCoord: coordStr,
            colLetter: colIndexToLetter(c),
            colIndex: c
          };
        })
      );
      setPickingTargetId(null);
      copyToClipboard(textVal, `[위치 지정: ${coordStr}] ${textVal}`);
      return;
    }

    // 2. 일반 모드: 셀 값 즉시 원클릭 복사!
    copyToClipboard(textVal, `셀 [${coordStr}] 값`, undefined);
  };

  // 셀 값 인라인 수정 저장
  const handleSaveCellEdit = () => {
    if (!editingCell) return;
    const { r, c, text } = editingCell;

    setWorkbookSheets(prev => {
      const current = prev[currentSheetName] ? [...prev[currentSheetName]] : [];
      while (current.length <= r) {
        current.push([]);
      }
      const updatedRow = [...(current[r] || [])];
      while (updatedRow.length <= c) {
        updatedRow.push('');
      }
      updatedRow[c] = text;
      current[r] = updatedRow;
      return {
        ...prev,
        [currentSheetName]: current
      };
    });

    setEditingCell(null);
    copyToClipboard(text, `[수정 및 복사] ${formatCellCoord(r, c)}: ${text}`);
  };

  // 행 전체 탭(\t) 구분 일괄 복사
  const handleCopyAllTabSeparated = () => {
    const values = fields.map(f => getFieldValue(f, activeRowIndex));
    const tabJoined = values.join('\t');
    copyToClipboard(tabJoined, `[행 ${activeRowIndex + 1} 전체 복사] (탭 구분)`);
  };

  // 프리셋 불러오기
  const handleApplyPreset = (preset: PresetTemplate) => {
    const applied: CopyFieldItem[] = preset.fields.map((pf, idx) => ({
      id: `field_preset_${Date.now()}_${idx}`,
      name: pf.name,
      posType: pf.posType,
      colLetter: pf.colLetter,
      colIndex: letterToColIndex(pf.colLetter),
      cellCoord: pf.cellCoord || `${pf.colLetter}${activeRowIndex + 1}`,
      copied: false
    }));
    setFields(applied);
    setIsPresetModalOpen(false);
  };

  // 현재 설정을 새 프리셋으로 저장
  const handleSaveCurrentAsPreset = () => {
    if (!presetNameInput.trim()) {
      alert('프리셋 서식 이름을 입력해주세요.');
      return;
    }
    const newPreset: PresetTemplate = {
      id: `preset_${Date.now()}`,
      name: presetNameInput.trim(),
      createdAt: new Date().toISOString().slice(0, 10),
      fields: fields.map(f => ({
        name: f.name,
        posType: f.posType,
        colLetter: f.colLetter,
        cellCoord: f.cellCoord
      }))
    };
    savePresetsToStorage([...presets, newPreset]);
    setPresetNameInput('');
    alert(`'${newPreset.name}' 서식이 저장되었습니다.`);
  };

  // 행 네비게이터: 이전 행 이동
  const handlePrevRow = () => {
    if (filteredRowIndices.length === 0) return;
    const currentIdx = filteredRowIndices.indexOf(activeRowIndex);
    if (currentIdx > 0) {
      setActiveRowIndex(filteredRowIndices[currentIdx - 1]);
    } else {
      setActiveRowIndex(filteredRowIndices[0]);
    }
  };

  // 행 네비게이터: 다음 행 이동
  const handleNextRow = () => {
    if (filteredRowIndices.length === 0) return;
    const currentIdx = filteredRowIndices.indexOf(activeRowIndex);
    if (currentIdx >= 0 && currentIdx < filteredRowIndices.length - 1) {
      setActiveRowIndex(filteredRowIndices[currentIdx + 1]);
    } else {
      setActiveRowIndex(filteredRowIndices[filteredRowIndices.length - 1]);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* 1. 상단 컨트롤 및 파일 업로드 헤더 바 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            accept=".xlsx, .xls, .csv"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              e.target.value = '';
            }}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
          >
            <Upload size={14} />
            <span>{fileName ? '파일 변경' : '엑셀 파일 업로드 (.xlsx, .xls, .csv)'}</span>
          </button>

          {fileName && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <FileSpreadsheet size={16} className="text-emerald-600 shrink-0" />
              <div className="truncate max-w-[260px]">
                <span className="font-bold text-slate-800">{fileName}</span>
                <span className="text-[11px] text-slate-400 ml-1.5">
                  ({(fileSize / 1024).toFixed(1)} KB · {totalRowCount.toLocaleString()}행)
                </span>
              </div>
            </div>
          )}

          {/* 시트 전환 탭 */}
          {sheetNames.length > 1 && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <span className="text-[11px] font-bold text-slate-500 px-1.5">시트:</span>
              {sheetNames.map(name => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setCurrentSheetName(name);
                    setColumnFilters({});
                    setSortState(null);
                  }}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    currentSheetName === name
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 우측 도구 모음 */}
        <div className="flex items-center gap-2">
          {/* 빠른 필터 행 토글 버튼 */}
          <button
            type="button"
            onClick={() => setShowQuickFilterRow(prev => !prev)}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border shadow-2xs ${
              showQuickFilterRow
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
            title="테이블 헤더 하단에 각 열별 인라인 검색 필터 입력창 토글"
          >
            <Filter size={13} className={showQuickFilterRow ? 'text-indigo-600' : 'text-slate-400'} />
            <span>열별 필터 입력줄 {showQuickFilterRow ? 'ON' : 'OFF'}</span>
          </button>

          {/* 프리셋 버튼 */}
          <button
            type="button"
            onClick={() => setIsPresetModalOpen(true)}
            className="py-2 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="자주 쓰는 복사 셀 위치 서식 저장 및 불러오기"
          >
            <Sliders size={13} className="text-indigo-600" />
            <span>서식 프리셋 ({presets.length})</span>
          </button>

          {/* 뷰 레이아웃 전환 토글 */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setLayoutMode('split')}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                layoutMode === 'split' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="원클릭 복사 카드와 스프레드시트를 분할해서 한눈에 보기"
            >
              <Columns size={13} />
              <span className="text-[11px] hidden sm:inline">분할 뷰</span>
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('cards')}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                layoutMode === 'cards' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="원클릭 복사 카드 보드 집중 뷰"
            >
              <Grid size={13} />
              <span className="text-[11px] hidden sm:inline">원클릭 카드</span>
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('grid')}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                layoutMode === 'grid' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="전체 시트 스프레드시트 뷰 (모든 셀 클릭 복사)"
            >
              <Table size={13} />
              <span className="text-[11px] hidden sm:inline">시트 전체</span>
            </button>
          </div>
        </div>
      </div>

      {/* 활성 필터 알림 및 초기화 바 */}
      {activeFilterCount > 0 && (
        <div className="p-2.5 px-4 bg-gradient-to-r from-amber-50 to-indigo-50 border border-amber-200/80 rounded-2xl flex items-center justify-between gap-3 text-xs shrink-0 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="p-1 bg-amber-500 text-white rounded-lg">
              <Filter size={13} />
            </span>
            <span className="font-bold text-slate-800">
              필터 적용 중: <strong className="text-indigo-700 font-black">{activeFilterCount}개 열</strong>에 필터가 걸려 있습니다.
            </span>
            <span className="px-2 py-0.5 bg-white border border-indigo-200 text-indigo-800 text-[11px] font-black rounded-lg">
              {filteredRowIndices.length.toLocaleString()}건 표시 / 전체 {totalDataRows.toLocaleString()}건
            </span>
          </div>

          <button
            type="button"
            onClick={handleClearAllFilters}
            className="py-1 px-3 bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 border border-rose-200 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
          >
            <FilterX size={12} />
            <span>모든 필터 초기화</span>
          </button>
        </div>
      )}

      {/* 파일이 없을 때의 가이드 안내 카드 */}
      {!fileName && (
        <div className="flex-1 flex flex-col items-center justify-center p-12 bg-white rounded-3xl border-2 border-dashed border-slate-200 text-center space-y-4">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center shadow-inner">
            <FileSpreadsheet size={32} />
          </div>
          <div className="space-y-1.5 max-w-md">
            <h3 className="text-base font-black text-slate-800">
              복사할 엑셀 파일을 업로드해주세요
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              정산서, 발주서, 회원목록 등 어떤 엑셀이든 업로드하면 항목별 값을{' '}
              <strong className="text-indigo-600 font-bold">단 한 번의 클릭</strong>으로 복사할 수 있는 편리한 작업 패널이 생성됩니다.
              열마다/셀마다 필터를 걸어 원하는 행만 쏙 골라내어 복사하세요.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="py-3 px-6 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-black text-sm rounded-2xl shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-2"
          >
            <Upload size={16} />
            <span>컴퓨터에서 엑셀 파일 선택하기</span>
          </button>
          <div className="flex items-center gap-4 text-[11px] text-slate-400 font-medium">
            <span>✨ 모든 셀 클릭 즉시 복사</span>
            <span>·</span>
            <span>🔍 각 열별·셀별 즉시 필터링</span>
            <span>·</span>
            <span>🎯 셀 위치(A1, B2) 실시간 수정</span>
            <span>·</span>
            <span>📑 행(Row) 탐색 및 한 줄 전체 복사</span>
          </div>
        </div>
      )}

      {/* 파일이 있을 때의 본체 컨텐츠 */}
      {fileName && (
        <div className="flex-1 flex flex-col md:flex-row gap-3 min-h-0 overflow-hidden">
          {/* ======================= 좌측/상단: 원클릭 복사 카드 보드 ======================= */}
          {(layoutMode === 'split' || layoutMode === 'cards') && (
            <div
              className={`flex flex-col bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden ${
                layoutMode === 'split' ? 'w-full md:w-[48%] lg:w-[42%] shrink-0' : 'w-full flex-1'
              }`}
            >
              {/* 카드 패널 상단: 행 네비게이터 & 일괄 복사 버튼 */}
              <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
                {/* 행 네비게이터 */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-slate-700 mr-1">현재 작업 행:</span>
                  <button
                    type="button"
                    onClick={handlePrevRow}
                    disabled={filteredRowIndices.length === 0 || currentFilteredPosition <= 0}
                    className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 disabled:opacity-30 cursor-pointer shadow-2xs transition-colors"
                    title="이전 행 (Alt + ←)"
                  >
                    <ChevronLeft size={14} />
                  </button>

                  <div className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 rounded-lg shadow-inner">
                    <span className="text-[11px] font-bold text-slate-400">행</span>
                    <input
                      type="number"
                      min={1}
                      max={totalRowCount}
                      value={activeRowIndex + 1}
                      onChange={e => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val >= 1 && val <= totalRowCount) {
                          setActiveRowIndex(val - 1);
                        }
                      }}
                      className="w-12 text-center text-xs font-black text-indigo-700 focus:outline-none"
                    />
                    <span className="text-[11px] font-bold text-slate-400">
                      / {filteredRowIndices.length.toLocaleString()}건
                      {activeFilterCount > 0 && ` (필터됨)`}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleNextRow}
                    disabled={
                      filteredRowIndices.length === 0 ||
                      currentFilteredPosition >= filteredRowIndices.length - 1
                    }
                    className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 disabled:opacity-30 cursor-pointer shadow-2xs transition-colors"
                    title="다음 행 (Alt + →)"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>

                {/* 일괄 복사 및 항목 추가 */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyAllTabSeparated}
                    className="py-1 px-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-[11px] font-black transition-all shadow-2xs cursor-pointer flex items-center gap-1"
                    title="현재 행의 모든 항목을 탭(\t)으로 묶어 복사합니다 (엑셀 붙여넣기 최적화)"
                  >
                    <Copy size={11} className="text-indigo-600" />
                    <span>한 줄 전체 복사</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAddField}
                    className="py-1 px-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-black transition-all cursor-pointer flex items-center gap-1"
                    title="새 복사 항목 추가"
                  >
                    <Plus size={12} />
                    <span>항목 추가</span>
                  </button>
                </div>
              </div>

              {/* 셀 위치 콕 찍기 모드 알림 바 */}
              {pickingTargetId && (
                <div className="p-2.5 bg-amber-500 text-white text-xs font-bold flex items-center justify-between shrink-0 animate-pulse">
                  <div className="flex items-center gap-2">
                    <Crosshair size={14} />
                    <span>
                      우측 스프레드시트에서 지정할 셀을 클릭하세요! (선택한 셀의 위치로 자동 설정됩니다)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPickingTargetId(null)}
                    className="text-[11px] underline font-bold cursor-pointer hover:opacity-80"
                  >
                    취소
                  </button>
                </div>
              )}

              {/* 복사 카드 목록 스크롤 영역 */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
                {fields.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 space-y-2">
                    <HelpCircle size={28} className="mx-auto text-slate-300" />
                    <p className="text-xs font-bold">등록된 복사 항목이 없습니다.</p>
                    <button
                      type="button"
                      onClick={handleAddField}
                      className="py-1.5 px-3 bg-indigo-600 text-white text-xs font-bold rounded-lg cursor-pointer"
                    >
                      + 첫 복사 항목 추가하기
                    </button>
                  </div>
                ) : (
                  fields.map((field, idx) => {
                    const cellVal = getFieldValue(field, activeRowIndex);
                    const isTargetPicking = pickingTargetId === field.id;

                    return (
                      <div
                        key={field.id}
                        className={`group p-3 rounded-xl border transition-all ${
                          field.copied
                            ? 'bg-emerald-50 border-emerald-400 shadow-sm'
                            : isTargetPicking
                            ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300'
                            : 'bg-white hover:bg-slate-50/80 border-slate-200 shadow-2xs'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          {/* 항목 이름 및 셀 위치 설정 */}
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-black flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <input
                              type="text"
                              value={field.name}
                              onChange={e => handleUpdateFieldName(field.id, e.target.value)}
                              className="font-black text-xs text-slate-800 bg-transparent hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-indigo-400 rounded px-1 py-0.5 max-w-[130px] truncate focus:outline-none"
                              placeholder="항목명"
                            />

                            {/* 셀 위치 수정 인풋 & 버튼 */}
                            <div className="flex items-center gap-1 shrink-0 ml-auto mr-1">
                              <span className="text-[10px] text-slate-400 font-bold">위치:</span>
                              <input
                                type="text"
                                value={
                                  field.posType === 'column'
                                    ? field.colLetter
                                    : field.cellCoord
                                }
                                onChange={e => handleUpdateFieldPosition(field.id, e.target.value)}
                                className="w-14 text-center font-mono text-[11px] font-black uppercase text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100/80 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded border border-indigo-200 py-0.5 px-1 focus:outline-none"
                                title="셀 위치를 수정하세요 (예: B2, C10 또는 A, B 열)"
                              />

                              {/* 시트에서 콕 찍기 버튼 */}
                              <button
                                type="button"
                                onClick={() => setPickingTargetId(isTargetPicking ? null : field.id)}
                                className={`p-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                                  isTargetPicking
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                                }`}
                                title="시트에서 클릭하여 셀 위치 바로 지정"
                              >
                                <Crosshair size={11} />
                              </button>
                            </div>
                          </div>

                          {/* 삭제 버튼 */}
                          <button
                            type="button"
                            onClick={() => handleDeleteField(field.id)}
                            className="text-slate-300 hover:text-rose-500 p-1 rounded transition-colors cursor-pointer shrink-0"
                            title="항목 삭제"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {/* 값 영역 및 원클릭 복사 버튼 */}
                        <div className="flex items-center gap-2">
                          <div
                            onClick={() => copyToClipboard(cellVal, field.name, field.id)}
                            className={`flex-1 px-3 py-2 rounded-lg border text-xs font-mono font-medium truncate cursor-pointer transition-all flex items-center justify-between ${
                              field.copied
                                ? 'bg-emerald-100/60 border-emerald-300 text-emerald-900'
                                : cellVal
                                ? 'bg-slate-50 border-slate-200 text-slate-800 hover:border-indigo-400 hover:bg-indigo-50/30'
                                : 'bg-slate-50/50 border-dashed border-slate-200 text-slate-400 italic'
                            }`}
                            title="클릭하여 복사"
                          >
                            <span className="truncate">{cellVal || '(빈 값)'}</span>
                            <span className="text-[10px] text-slate-400 font-sans ml-2 shrink-0">
                              {cellVal.length > 0 ? `${cellVal.length}자` : ''}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => copyToClipboard(cellVal, field.name, field.id)}
                            className={`py-2 px-3.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shrink-0 shadow-2xs active:scale-95 ${
                              field.copied
                                ? 'bg-emerald-600 text-white shadow-emerald-200'
                                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'
                            }`}
                          >
                            {field.copied ? (
                              <>
                                <Check size={13} />
                                <span>복사됨!</span>
                              </>
                            ) : (
                              <>
                                <Copy size={13} />
                                <span>복사</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* 하단 단축 안내 */}
              <div className="p-2.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
                <span>💡 [위치]에 <strong className="text-indigo-600">B2</strong>처럼 셀 좌표를 적거나 <strong className="text-indigo-600">A</strong>처럼 열을 적어 수정할 수 있습니다.</span>
                <span className="text-slate-400">총 {fields.length}개 항목</span>
              </div>
            </div>
          )}

          {/* ======================= 우측/하단: 전체 시트 스프레드시트 뷰어 (필터 탑재) ======================= */}
          {(layoutMode === 'split' || layoutMode === 'grid') && (
            <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden min-w-0 relative">
              {/* 시트 툴바 */}
              <div className="p-2.5 px-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <Table size={15} className="text-indigo-600" />
                    <span className="text-xs font-black text-slate-800">
                      시트: {currentSheetName}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-black rounded-full">
                    셀 클릭: 원클릭 복사
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-full">
                    셀 호버: 즉시 필터
                  </span>
                </div>

                {/* 시트 내 텍스트 전체 검색 */}
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="셀 내용 실시간 검색..."
                      value={sheetSearch}
                      onChange={e => setSheetSearch(e.target.value)}
                      className="pl-7 pr-3 py-1 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 w-36 sm:w-44"
                    />
                    {sheetSearch && (
                      <button
                        type="button"
                        onClick={() => setSheetSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 hidden lg:inline">
                    더블클릭: 셀 편집
                  </span>
                </div>
              </div>

              {/* 스프레드시트 스크롤 테이블 */}
              <div className="flex-1 overflow-auto bg-slate-100/50 relative">
                <table className="border-collapse table-auto text-xs bg-white min-w-full">
                  <thead>
                    {/* 1. 컬럼 헤더 행 (A, B, C... + 필터 버튼 + 정렬 버튼) */}
                    <tr className="bg-slate-100 text-slate-700 sticky top-0 z-20 shadow-2xs border-b border-slate-300">
                      {/* 행 번호 컬럼 헤더 */}
                      <th className="w-12 px-2 py-2 border border-slate-300 font-mono text-[11px] font-black bg-slate-200/90 text-center sticky left-0 z-30">
                        #
                      </th>

                      {Array.from({ length: maxColCount }).map((_, c) => {
                        const letter = colIndexToLetter(c);
                        const isMapped = fields.some(
                          f => f.posType === 'column' && (f.colIndex === c || f.colLetter === letter)
                        );
                        const filterRule = columnFilters[c];
                        const isFiltered = Boolean(
                          filterRule &&
                          ((filterRule.textQuery && filterRule.textQuery.trim() !== '') ||
                            (filterRule.selectedValues && filterRule.selectedValues.length > 0))
                        );
                        const isSorted = sortState && sortState.colIndex === c;
                        const headerName = sheetData[0]?.[c] ? String(sheetData[0][c]) : '';

                        return (
                          <th
                            key={c}
                            className={`px-2.5 py-1.5 border border-slate-300 select-none transition-colors relative ${
                              isFiltered
                                ? 'bg-amber-100/90 text-amber-950 font-black'
                                : isMapped
                                ? 'bg-indigo-100 text-indigo-900 font-bold'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1.5 min-w-[90px]">
                              {/* 열 문자 및 헤더명 */}
                              <div
                                onClick={() => handleToggleSort(c)}
                                className="flex items-center gap-1 cursor-pointer hover:text-indigo-600 truncate flex-1"
                                title={`클릭하여 ${letter}열 정렬 (현재: ${isSorted ? (sortState.direction === 'asc' ? '오름차순' : '내림차순') : '기본'})`}
                              >
                                <span className="font-mono text-xs font-black">{letter}</span>
                                {headerName && (
                                  <span className="text-[11px] font-medium text-slate-500 truncate max-w-[80px]">
                                    ({headerName})
                                  </span>
                                )}
                                {isSorted && (
                                  <span className="text-indigo-600 font-black shrink-0">
                                    {sortState.direction === 'asc' ? '▲' : '▼'}
                                  </span>
                                )}
                              </div>

                              {/* 열 필터 버튼 (깔때기) */}
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  setActiveFilterCol(activeFilterCol === c ? null : c);
                                }}
                                className={`p-1 rounded-md transition-all cursor-pointer shrink-0 ${
                                  isFiltered
                                    ? 'bg-amber-500 text-white shadow-xs'
                                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-300/60'
                                }`}
                                title={`${letter}열 필터 설정 (검색 및 고유값 선택)`}
                              >
                                <Filter size={12} />
                              </button>
                            </div>
                          </th>
                        );
                      })}
                    </tr>

                    {/* 2. 빠른 인라인 필터 입력행 (showQuickFilterRow가 켜져 있을 때) */}
                    {showQuickFilterRow && (
                      <tr className="bg-slate-50 sticky top-[33px] z-20 shadow-2xs border-b-2 border-indigo-200">
                        <th className="w-12 px-1 py-1 border border-slate-300 bg-slate-100 text-slate-400 font-mono text-[10px] text-center sticky left-0 z-30">
                          필터
                        </th>
                        {Array.from({ length: maxColCount }).map((_, c) => {
                          const currentVal = columnFilters[c]?.textQuery || '';
                          return (
                            <th key={c} className="p-1 border border-slate-300 bg-slate-50">
                              <div className="relative flex items-center">
                                <input
                                  type="text"
                                  placeholder="검색 필터..."
                                  value={currentVal}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setColumnFilters(prev => ({
                                      ...prev,
                                      [c]: {
                                        ...prev[c],
                                        textQuery: val
                                      }
                                    }));
                                  }}
                                  className={`w-full px-1.5 py-0.5 text-[11px] font-mono rounded border transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                                    currentVal
                                      ? 'bg-amber-50 border-amber-400 font-bold text-amber-900'
                                      : 'bg-white border-slate-200 text-slate-700'
                                  }`}
                                />
                                {currentVal && (
                                  <button
                                    type="button"
                                    onClick={() => handleClearColumnFilter(c)}
                                    className="absolute right-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                                    title="필터 지우기"
                                  >
                                    <X size={11} />
                                  </button>
                                )}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    )}
                  </thead>

                  <tbody>
                    {/* 데이터 행 렌더링 (필터된 행만 표시) */}
                    {filteredRowIndices.length === 0 ? (
                      <tr>
                        <td
                          colSpan={maxColCount + 1}
                          className="py-16 text-center text-slate-400 space-y-2 bg-white"
                        >
                          <FilterX size={28} className="mx-auto text-slate-300" />
                          <p className="text-xs font-bold text-slate-600">
                            필터 조건과 일치하는 행이 없습니다.
                          </p>
                          <button
                            type="button"
                            onClick={handleClearAllFilters}
                            className="py-1.5 px-3 bg-indigo-600 text-white text-xs font-bold rounded-lg cursor-pointer"
                          >
                            모든 필터 초기화
                          </button>
                        </td>
                      </tr>
                    ) : (
                      filteredRowIndices.slice(0, 300).map((r, rowOrderIdx) => {
                        const row = sheetData[r];
                        const isActiveRow = r === activeRowIndex;
                        return (
                          <tr
                            key={r}
                            className={`hover:bg-indigo-50/30 transition-colors ${
                              isActiveRow ? 'bg-indigo-50/70 font-semibold' : ''
                            }`}
                          >
                            {/* 행 번호 헤더 */}
                            <td
                              onClick={() => setActiveRowIndex(r)}
                              className={`w-12 px-2 py-1.5 border border-slate-300 font-mono text-[11px] text-center select-none cursor-pointer sticky left-0 z-10 ${
                                isActiveRow
                                  ? 'bg-indigo-600 text-white font-black'
                                  : 'bg-slate-100/80 text-slate-500 hover:bg-slate-200'
                              }`}
                              title="이 행을 작업 행으로 선택"
                            >
                              {r + 1}
                            </td>

                            {/* 각 셀 데이터 */}
                            {Array.from({ length: maxColCount }).map((_, c) => {
                              const rawVal = row ? row[c] : '';
                              const strVal = String(rawVal ?? '');
                              const coord = formatCellCoord(r, c);

                              // 현재 셀이 복사 필드에 매핑되어 있는지 확인
                              const mappedField = fields.find(f => {
                                if (f.posType === 'cell') {
                                  return f.cellCoord === coord;
                                }
                                return isActiveRow && (f.colIndex === c || f.colLetter === colIndexToLetter(c));
                              });

                              // 검색어 매칭 여부
                              const isSearchMatch =
                                sheetSearch.trim().length > 0 &&
                                strVal.toLowerCase().includes(sheetSearch.trim().toLowerCase());

                              // 현재 셀 편집 중인지
                              const isEditing = editingCell?.r === r && editingCell?.c === c;

                              return (
                                <td
                                  key={c}
                                  onDoubleClick={e => {
                                    e.stopPropagation();
                                    setEditingCell({ r, c, text: strVal });
                                  }}
                                  onClick={() => {
                                    if (!isEditing) {
                                      handleCellClick(r, c, strVal);
                                    }
                                  }}
                                  className={`px-2.5 py-1.5 border border-slate-200 font-mono text-xs max-w-[240px] truncate cursor-pointer transition-all relative group/cell ${
                                    isEditing
                                      ? 'p-0 bg-white ring-2 ring-indigo-500'
                                      : isSearchMatch
                                      ? 'bg-amber-100 font-black text-amber-900 ring-2 ring-amber-400'
                                      : mappedField
                                      ? 'bg-indigo-50/40 border-indigo-200 text-indigo-950 font-bold'
                                      : 'hover:bg-slate-100 text-slate-800'
                                  }`}
                                  title={`[${coord}] ${strVal || '(빈 셀)'}\n• 클릭: 원클릭 복사\n• 호버 깔때기: 이 값으로 필터\n• 더블클릭: 편집`}
                                >
                                  {isEditing ? (
                                    <div className="flex items-center">
                                      <input
                                        autoFocus
                                        type="text"
                                        value={editingCell.text}
                                        onChange={e =>
                                          setEditingCell({ ...editingCell, text: e.target.value })
                                        }
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') handleSaveCellEdit();
                                          if (e.key === 'Escape') setEditingCell(null);
                                        }}
                                        onBlur={handleSaveCellEdit}
                                        className="w-full px-2 py-1 text-xs font-mono font-bold bg-white focus:outline-none"
                                      />
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="truncate">{strVal}</span>

                                      {/* 호버 시 동작 버튼들 (원클릭 필터 & 복사) */}
                                      <div className="opacity-0 group-hover/cell:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
                                        {/* 셀 값으로 즉시 필터 걸기 */}
                                        <button
                                          type="button"
                                          onClick={e => {
                                            e.stopPropagation();
                                            handleFilterByCellValue(c, strVal);
                                          }}
                                          className="p-1 hover:bg-amber-100 text-amber-700 rounded transition-colors"
                                          title={`이 값 ("${strVal}")으로 ${colIndexToLetter(c)}열 필터링`}
                                        >
                                          <Filter size={11} />
                                        </button>
                                        {/* 복사 아이콘 */}
                                        <span className="text-indigo-500">
                                          <Copy size={11} />
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>

                {filteredRowIndices.length > 300 && (
                  <div className="p-3 bg-slate-50 border-t border-slate-200 text-center text-xs text-slate-500">
                    성능 최적화를 위해 필터된 상위 300행을 표시 중입니다. (필터 결과 {filteredRowIndices.length}행 중)
                  </div>
                )}
              </div>

              {/* ======================= 열 필터 드롭다운 팝오버 ======================= */}
              {activeFilterCol !== null && (
                <div
                  ref={filterPopoverRef}
                  className="absolute top-12 left-16 z-50 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 w-72 space-y-3.5 animate-in fade-in zoom-in-95 duration-150"
                  style={{
                    maxHeight: '440px'
                  }}
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-1.5">
                      <Filter size={14} className="text-indigo-600" />
                      <h4 className="text-xs font-black text-slate-800">
                        {colIndexToLetter(activeFilterCol)}열 필터 설정
                        {sheetData[0]?.[activeFilterCol] && (
                          <span className="font-normal text-slate-500 ml-1">
                            ({String(sheetData[0][activeFilterCol])})
                          </span>
                        )}
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveFilterCol(null)}
                      className="p-1 text-slate-400 hover:text-slate-600"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* 정렬 버튼 */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSortState({ colIndex: activeFilterCol, direction: 'asc' });
                        setActiveFilterCol(null);
                      }}
                      className={`py-1.5 px-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1 cursor-pointer transition-all ${
                        sortState?.colIndex === activeFilterCol && sortState.direction === 'asc'
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      <ArrowUp size={12} />
                      <span>오름차순 정렬</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSortState({ colIndex: activeFilterCol, direction: 'desc' });
                        setActiveFilterCol(null);
                      }}
                      className={`py-1.5 px-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1 cursor-pointer transition-all ${
                        sortState?.colIndex === activeFilterCol && sortState.direction === 'desc'
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      <ArrowDown size={12} />
                      <span>내림차순 정렬</span>
                    </button>
                  </div>

                  {/* 텍스트 검색 */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500">텍스트 포함 검색</label>
                    <input
                      type="text"
                      placeholder="검색어 입력..."
                      value={columnFilters[activeFilterCol]?.textQuery || ''}
                      onChange={e => {
                        const val = e.target.value;
                        setColumnFilters(prev => ({
                          ...prev,
                          [activeFilterCol]: {
                            ...prev[activeFilterCol],
                            textQuery: val
                          }
                        }));
                      }}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {/* 고유값 목록 체크박스 */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                      <span>고유값 선택 ({getColumnUniqueValues(activeFilterCol).length})</span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setColumnFilters(prev => {
                              const next = { ...prev };
                              if (next[activeFilterCol]) {
                                next[activeFilterCol] = {
                                  ...next[activeFilterCol],
                                  selectedValues: undefined
                                };
                              }
                              return next;
                            });
                          }}
                          className="text-indigo-600 hover:underline cursor-pointer"
                        >
                          전체
                        </button>
                        <span>·</span>
                        <button
                          type="button"
                          onClick={() => {
                            setColumnFilters(prev => ({
                              ...prev,
                              [activeFilterCol]: {
                                ...prev[activeFilterCol],
                                selectedValues: []
                              }
                            }));
                          }}
                          className="text-slate-400 hover:underline cursor-pointer"
                        >
                          해제
                        </button>
                      </div>
                    </div>

                    <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-1.5 bg-slate-50/50 space-y-1">
                      {getColumnUniqueValues(activeFilterCol).slice(0, 50).map(([val, count]) => {
                        const selectedList = columnFilters[activeFilterCol]?.selectedValues;
                        const isChecked = !selectedList || selectedList.includes(val);

                        return (
                          <label
                            key={val}
                            className="flex items-center justify-between px-2 py-1 hover:bg-white rounded-lg text-xs cursor-pointer select-none"
                          >
                            <div className="flex items-center gap-1.5 truncate mr-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={e => {
                                  const checked = e.target.checked;
                                  setColumnFilters(prev => {
                                    const currentSelected =
                                      prev[activeFilterCol]?.selectedValues !== undefined
                                        ? [...prev[activeFilterCol].selectedValues!]
                                        : getColumnUniqueValues(activeFilterCol).map(v => v[0]);

                                    let newSelected: string[];
                                    if (checked) {
                                      newSelected = [...currentSelected, val];
                                    } else {
                                      newSelected = currentSelected.filter(item => item !== val);
                                    }

                                    return {
                                      ...prev,
                                      [activeFilterCol]: {
                                        ...prev[activeFilterCol],
                                        selectedValues: newSelected
                                      }
                                    };
                                  });
                                }}
                                className="rounded text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="truncate font-mono">{val}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-bold shrink-0">
                              {count}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* 팝오버 하단 액션 버튼 */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        handleClearColumnFilter(activeFilterCol);
                        setActiveFilterCol(null);
                      }}
                      className="text-xs font-bold text-rose-500 hover:underline cursor-pointer"
                    >
                      이 열 필터 해제
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveFilterCol(null)}
                      className="py-1.5 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl cursor-pointer"
                    >
                      확인
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ======================= 복사 완료 토스트 알림 ======================= */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-8 right-8 z-50 bg-slate-900/95 text-white backdrop-blur-md px-4 py-3 rounded-2xl shadow-2xl border border-slate-700/60 flex items-center gap-3"
          >
            <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-400/30">
              <CheckCircle2Icon size={18} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400">{toastMessage.title}</p>
              <p className="text-xs font-black text-emerald-300 font-mono">
                "{toastMessage.value}"
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ======================= 프리셋 서식 관리 모달 ======================= */}
      <AnimatePresence>
        {isPresetModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-100 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Sliders size={18} className="text-indigo-600" />
                  <h3 className="text-sm font-black text-slate-800">
                    셀 위치 복사 서식 프리셋 관리
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPresetModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              {/* 현재 설정 저장하기 */}
              <div className="p-3.5 bg-indigo-50/60 rounded-2xl border border-indigo-100 space-y-2">
                <label className="text-xs font-black text-indigo-900 block">
                  현재 설정된 셀 위치를 새 서식으로 저장
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="예: 2026 에넥스 정산 복사 양식"
                    value={presetNameInput}
                    onChange={e => setPresetNameInput(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleSaveCurrentAsPreset}
                    className="py-2 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-xs cursor-pointer shrink-0"
                  >
                    저장하기
                  </button>
                </div>
              </div>

              {/* 저장된 서식 목록 */}
              <div className="space-y-2 max-h-60 overflow-y-auto">
                <label className="text-xs font-bold text-slate-500 block">
                  저장된 서식 목록 ({presets.length}개)
                </label>
                {presets.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">저장된 서식이 없습니다.</p>
                ) : (
                  presets.map(p => (
                    <div
                      key={p.id}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-2 hover:bg-slate-100 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-black text-slate-800 truncate">{p.name}</h4>
                        <p className="text-[10px] text-slate-400">
                          항목 {p.fields.length}개 · {p.createdAt}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleApplyPreset(p)}
                          className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black rounded-lg transition-all cursor-pointer shadow-2xs"
                        >
                          불러오기
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`'${p.name}' 서식을 삭제하시겠습니까?`)) {
                              savePresetsToStorage(presets.filter(item => item.id !== p.id));
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg transition-colors cursor-pointer"
                          title="삭제"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsPresetModalOpen(false)}
                  className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  닫기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

function CheckCircle2Icon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

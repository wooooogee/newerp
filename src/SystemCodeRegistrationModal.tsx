import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Upload,
  Download,
  Copy,
  Check,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Search,
  CheckSquare,
  Square,
  Trash2,
  Edit3,
  FileSpreadsheet,
  ArrowRight,
  RefreshCw,
  Info,
  ExternalLink,
  ShieldCheck,
  UserPlus
} from 'lucide-react';
import { MemberAccount } from './AccountManagementModal';
import { EmpRowData } from './MissingAccountCleanupModal';
import { customConfirm } from './CustomDialog';

const XLSX = (window as any).XLSX;

export interface SystemCodeRow {
  id: string; // 고유 키
  position: string; // 직급 (A열)
  hq: string; // 본부 (B열)
  branch: string; // 지사 (C열)
  name: string; // 이름 (D열)
  phone: string; // 연락처 (E열)
  birthDate: string; // 생년월일 (F열)
  systemId: string; // ID (G열)
  systemPw: string; // PW (H열)

  // 대사 결과
  normalizedPhone: string;
  isDuplicate: boolean; // 사원리스트 L열 중복 여부
  matchedEmps: EmpRowData[]; // 사원리스트에서 일치하는 사원 정보들

  // 본부/지사 사원리스트 존재 여부 (C열, D열)
  isHqMissing: boolean;
  isBranchMissing: boolean;

  // 선택 & 상태
  isSelected: boolean;
  isIgnored: boolean;

  // 편집 모드 여부
  isEditing?: boolean;
}

interface SystemCodeRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  empRows: EmpRowData[]; // 사원리스트 시트 데이터 (L열: phone)
  existingMembers: MemberAccount[]; // 현재 등록된 시스템 계정 목록
  onAddMembers: (newMembers: MemberAccount[]) => void;
}

// 전화번호 정규화 헬퍼 (특수문자 제거 및 010 보정)
function normalizePhone(val: any): string {
  let s = String(val ?? '').replace(/[^0-9]/g, '');
  if (s.length === 10 && s.startsWith('10')) {
    s = '0' + s;
  }
  return s;
}

// 하이픈 포맷팅 헬퍼
function formatPhone(val: string): string {
  const norm = normalizePhone(val);
  if (norm.length === 11) {
    return `${norm.slice(0, 3)}-${norm.slice(3, 7)}-${norm.slice(7)}`;
  }
  if (norm.length === 10) {
    if (norm.startsWith('02')) {
      return `${norm.slice(0, 2)}-${norm.slice(2, 6)}-${norm.slice(6)}`;
    }
    return `${norm.slice(0, 3)}-${norm.slice(3, 6)}-${norm.slice(6)}`;
  }
  return val;
}

export function SystemCodeRegistrationModal({
  isOpen,
  onClose,
  empRows,
  existingMembers,
  onAddMembers
}: SystemCodeRegistrationModalProps) {
  const [rows, setRows] = useState<SystemCodeRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'all' | 'new' | 'duplicate' | 'org_missing'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCellId, setCopiedCellId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [defaultRole, setDefaultRole] = useState('영업사원');
  const [isDragOver, setIsDragOver] = useState(false);

  // 편집 중인 행의 임시 상태 { [id: string]: SystemCodeRow }
  const [editingRows, setEditingRows] = useState<{ [id: string]: SystemCodeRow }>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 사원리스트 시트 C열(본부명) Set
  const validHqSet = useMemo(() => {
    const set = new Set<string>();
    (empRows || []).forEach(emp => {
      const h = (emp.hq || '').trim();
      if (h && h !== '-' && h !== '본부') {
        set.add(h);
      }
    });
    return set;
  }, [empRows]);

  // 사원리스트 시트 D열(지사명) Set
  const validBranchSet = useMemo(() => {
    const set = new Set<string>();
    (empRows || []).forEach(emp => {
      const b = (emp.branch || '').trim();
      if (b && b !== '-' && b !== '지사') {
        set.add(b);
      }
    });
    return set;
  }, [empRows]);

  // 본부명 유효성 검사 (사원리스트 C열 존재 여부)
  const checkIsValidHq = (hqName: string) => {
    const h = (hqName || '').trim();
    if (!h || h === '-') return false;
    if (validHqSet.has(h)) return true;
    const noSpace = h.replace(/\s+/g, '');
    for (const valid of validHqSet) {
      if (valid.replace(/\s+/g, '') === noSpace) return true;
    }
    return false;
  };

  // 지사명 유효성 검사 (사원리스트 D열 존재 여부)
  const checkIsValidBranch = (branchName: string) => {
    const b = (branchName || '').trim();
    if (!b || b === '-') return false;
    if (validBranchSet.has(b)) return true;
    const noSpace = b.replace(/\s+/g, '');
    for (const valid of validBranchSet) {
      if (valid.replace(/\s+/g, '') === noSpace) return true;
    }
    return false;
  };

  // 사원리스트 시트 L열(연락처) 기반 매핑 맵
  const empPhoneMap = useMemo(() => {
    const map = new Map<string, EmpRowData[]>();
    (empRows || []).forEach(emp => {
      const norm = normalizePhone(emp.phone);
      if (norm) {
        if (!map.has(norm)) map.set(norm, []);
        map.get(norm)!.push(emp);
      }
    });
    return map;
  }, [empRows]);

  // 기존 계정 username 맵
  const existingUsernameSet = useMemo(() => {
    const set = new Set<string>();
    (existingMembers || []).forEach(m => {
      if (m.username) set.add(m.username.trim().toLowerCase());
    });
    return set;
  }, [existingMembers]);

  // 알림 토스트 표시
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  // 클립보드 복사 헬퍼
  const copyToClipboard = (text: string, cellKey?: string, label?: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      if (cellKey) {
        setCopiedCellId(cellKey);
        setTimeout(() => setCopiedCellId(null), 1500);
      }
      showToast(`${label ? `[${label}] ` : ''}'${text}' 복사되었습니다.`);
    }).catch(err => {
      console.error('클립보드 복사 실패:', err);
    });
  };

  // 엑셀 파일 파싱 처리
  const processExcelFile = (file: File) => {
    if (!XLSX) {
      alert('XLSX 라이브러리가 로드되지 않았습니다.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawJson: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (!rawJson || rawJson.length === 0) {
          alert('엑셀 파일에 데이터가 없습니다.');
          return;
        }

        // 헤더 행 감지 (1행의 값이 직급, 본부, 지사, 이름, 연락처, ID 등 헤더인지 검사)
        let startIndex = 0;
        const firstRowStr = (rawJson[0] || []).map(cell => String(cell).trim()).join(' ');
        if (
          firstRowStr.includes('직급') || 
          firstRowStr.includes('본부') || 
          firstRowStr.includes('이름') || 
          firstRowStr.includes('연락처') ||
          firstRowStr.includes('아이디') ||
          firstRowStr.includes('ID')
        ) {
          startIndex = 1;
        }

        const parsedRows: SystemCodeRow[] = [];

        for (let i = startIndex; i < rawJson.length; i++) {
          const r = rawJson[i];
          if (!r || r.length === 0) continue;

          // A: 직급, B: 본부, C: 지사, D: 이름, E: 연락처, F: 생년월일, G: ID, H: PW
          let position = String(r[0] ?? '').trim();
          let hq = String(r[1] ?? '').trim();
          let branch = String(r[2] ?? '').trim();
          let name = String(r[3] ?? '').trim();
          let phoneRaw = String(r[4] ?? '').trim();
          let birthDateRaw = String(r[5] ?? '').trim();
          let systemId = String(r[6] ?? '').trim();
          let systemPw = String(r[7] ?? '').trim();

          // 빈 행 스킵
          if (!name && !phoneRaw && !systemId && !systemPw && !hq && !branch) {
            continue;
          }

          // 생년월일 포맷 보정 (6자리 숫자인 경우 0-padding, 예: 721010)
          let birthDate = birthDateRaw.replace(/[^0-9]/g, '');
          if (birthDate.length > 0 && birthDate.length < 6) {
            birthDate = birthDate.padStart(6, '0');
          }

          // PW 보정 (10자리 핸드폰 형식인 경우 앞자리 0 보정)
          if (systemPw.length === 10 && systemPw.startsWith('10')) {
            systemPw = '0' + systemPw;
          }

          // 전화번호 정규화 및 사원리스트 L열 대사
          const normalizedPhone = normalizePhone(phoneRaw);
          const matchedEmps = normalizedPhone ? (empPhoneMap.get(normalizedPhone) || []) : [];
          const isDuplicate = matchedEmps.length > 0;

          // ID가 없을 경우 자동 추천: 'A' + 010...
          if (!systemId && normalizedPhone) {
            systemId = 'A' + normalizedPhone;
          }
          // PW가 없을 경우 자동 추천: normalizedPhone
          if (!systemPw && normalizedPhone) {
            systemPw = normalizedPhone;
          }

          // 본부/지사 사원리스트 C열/D열 대사
          const isHqMissing = !checkIsValidHq(hq);
          const isBranchMissing = !checkIsValidBranch(branch);

          parsedRows.push({
            id: `row_${i}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            position,
            hq,
            branch,
            name,
            phone: phoneRaw,
            birthDate,
            systemId,
            systemPw,
            normalizedPhone,
            isDuplicate,
            matchedEmps,
            isHqMissing,
            isBranchMissing,
            isSelected: !isDuplicate, // 중복이 아니면 기본 선택, 중복이면 기본 선택 해제
            isIgnored: false
          });
        }

        if (parsedRows.length === 0) {
          alert('유효한 데이터 행을 찾을 수 없습니다. 엑셀 양식을 확인해 주세요.');
          return;
        }

        setRows(parsedRows);
        setFileName(file.name);
        // 기본 탭: 중복이 있으면 전체, 없으면 신규
        const hasDup = parsedRows.some(r => r.isDuplicate);
        setActiveTab(hasDup ? 'all' : 'new');
        showToast(`총 ${parsedRows.length}건의 데이터를 성공적으로 불러왔습니다.`);
      } catch (err) {
        console.error('엑셀 파싱 오류:', err);
        alert('엑셀 파일을 읽는 도중 오류가 발생했습니다. 올바른 파일인지 확인해 주세요.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processExcelFile(file);
    }
    // 동일 파일 재선택 가능하도록 리셋
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processExcelFile(file);
    }
  };

  // 엑셀 양식 다운로드
  const handleDownloadTemplate = () => {
    if (!XLSX) return alert('XLSX 라이브러리가 로드되지 않았습니다.');
    const sampleData = [
      ['직급', '본부', '지사', '이름', '연락처', '생년월일', 'ID', 'PW'],
      ['HC', '아우라본부', '서지민', '김정환', '010-4014-6963', '721010', 'A01040146963', '01040146963'],
      ['HC', '최강본부', '구미지', '서숙희', '010-2503-4903', '710505', 'A01025034903', '01025034903'],
      ['매니저', '강남본부', '역삼지', '홍길동', '010-1234-5678', '850101', 'A01012345678', '01012345678']
    ];
    const ws = XLSX.utils.aoa_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '전산코드등록양식');
    XLSX.writeFile(wb, '전산코드등록_엑셀양식.xlsx');
  };

  // 행 선택 토글
  const handleToggleSelect = (id: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, isSelected: !r.isSelected } : r));
  };

  // 전체 선택 / 해제
  const handleSelectAll = (select: boolean) => {
    setRows(prev => prev.map(r => {
      // 현재 필터된 뷰에 포함된 행만 선택/해제
      if (filteredRows.some(f => f.id === r.id)) {
        return { ...r, isSelected: select };
      }
      return r;
    }));
  };

  // 행 삭제
  const handleDeleteRow = (id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
    setEditingRows(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // 행 인라인 편집 모드 시작
  const handleStartEdit = (row: SystemCodeRow) => {
    setEditingRows(prev => ({
      ...prev,
      [row.id]: { ...row }
    }));
  };

  // 행 인라인 편집 필드 변경
  const handleEditChange = (id: string, field: keyof SystemCodeRow, value: string) => {
    setEditingRows(prev => {
      const target = prev[id];
      if (!target) return prev;
      return {
        ...prev,
        [id]: {
          ...target,
          [field]: value
        }
      };
    });
  };

  // 행 인라인 편집 저장
  const handleSaveEdit = (id: string) => {
    const edited = editingRows[id];
    if (!edited) return;

    // 전화번호 정규화 및 재대사
    const norm = normalizePhone(edited.phone);
    const matchedEmps = norm ? (empPhoneMap.get(norm) || []) : [];
    // 본부/지사 사원리스트 C열/D열 재대사
    const isHqMissing = !checkIsValidHq(edited.hq);
    const isBranchMissing = !checkIsValidBranch(edited.branch);

    setRows(prev => prev.map(r => {
      if (r.id === id) {
        return {
          ...edited,
          normalizedPhone: norm,
          isDuplicate: isDup,
          matchedEmps,
          isHqMissing,
          isBranchMissing,
          // 수정해서 중복이 풀렸다면 자동으로 선택 처리
          isSelected: r.isSelected || !isDup
        };
      }
      return r;
    }));

    setEditingRows(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    showToast('수정 사항이 저장되었습니다.');
  };

  // 행 인라인 편집 취소
  const handleCancelEdit = (id: string) => {
    setEditingRows(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // 행 전체 클립보드 복사 (탭 구분: 직급\t본부\t지사\t이름\t연락처\t생년월일\tID\tPW)
  const handleCopyRow = (row: SystemCodeRow) => {
    const tsv = [
      row.position,
      row.hq,
      row.branch,
      row.name,
      row.phone,
      row.birthDate,
      row.systemId,
      row.systemPw
    ].join('\t');
    copyToClipboard(tsv, `row_${row.id}`, `${row.name} 전체 행`);
  };

  // 행의 ID/PW 클립보드 복사
  const handleCopyIdPw = (row: SystemCodeRow) => {
    const text = `${row.systemId}\t${row.systemPw}`;
    copyToClipboard(text, `idpw_${row.id}`, `${row.name} ID/PW`);
  };

  // 선택된 행 전체 클립보드 복사 (엑셀/외부 웹 일괄 붙여넣기용 TSV)
  const handleCopySelectedRows = () => {
    const selected = rows.filter(r => r.isSelected && !r.isIgnored);
    if (selected.length === 0) {
      alert('복사할 선택된 항목이 없습니다.');
      return;
    }

    const tsv = selected.map(r => [
      r.position,
      r.hq,
      r.branch,
      r.name,
      r.phone,
      r.birthDate,
      r.systemId,
      r.systemPw
    ].join('\t')).join('\n');

    copyToClipboard(tsv, undefined, `선택 ${selected.length}건 전체`);
  };

  // 필터링된 행 목록
  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      if (row.isIgnored) return false;

      // 탭 필터
      if (activeTab === 'new' && row.isDuplicate) return false;
      if (activeTab === 'duplicate' && !row.isDuplicate) return false;
      if (activeTab === 'org_missing' && !row.isHqMissing && !row.isBranchMissing) return false;

      // 검색어 필터
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const match =
          row.name.toLowerCase().includes(q) ||
          row.phone.toLowerCase().includes(q) ||
          row.systemId.toLowerCase().includes(q) ||
          row.systemPw.toLowerCase().includes(q) ||
          row.hq.toLowerCase().includes(q) ||
          row.branch.toLowerCase().includes(q) ||
          row.position.toLowerCase().includes(q) ||
          (q.includes('미확인') && (row.isHqMissing || row.isBranchMissing)) ||
          (row.matchedEmps && row.matchedEmps.some(e => e.name.toLowerCase().includes(q) || e.hq.toLowerCase().includes(q)));
        if (!match) return false;
      }

      return true;
    });
  }, [rows, activeTab, searchQuery]);

  // 통계 계산
  const stats = useMemo(() => {
    const total = rows.length;
    const duplicates = rows.filter(r => r.isDuplicate).length;
    const newItems = total - duplicates;
    const orgMissing = rows.filter(r => r.isHqMissing || r.isBranchMissing).length;
    const selectedCount = rows.filter(r => r.isSelected && !r.isIgnored).length;
    return { total, duplicates, newItems, orgMissing, selectedCount };
  }, [rows]);

  // 최종 계정 생성 처리
  const handleCreateAccounts = async () => {
    const targetRows = rows.filter(r => r.isSelected && !r.isIgnored);
    if (targetRows.length === 0) {
      alert('생성할 계정을 최소 1개 이상 선택해 주세요.');
      return;
    }

    // 누락 필드 검사 (ID 또는 PW 없는 건)
    const invalidRows = targetRows.filter(r => !r.systemId || !r.systemPw);
    if (invalidRows.length > 0) {
      alert(`아이디(ID) 또는 비밀번호(PW)가 누락된 행이 ${invalidRows.length}건 있습니다.\n해당 행의 정보를 입력하거나 선택을 해제해 주세요.`);
      return;
    }

    // 중복 포함 여부 확인
    const dupCount = targetRows.filter(r => r.isDuplicate).length;
    let confirmMsg = `선택하신 [${targetRows.length}건]의 계정을 신규 등록하시겠습니까?\n기본 역할: ${defaultRole}`;
    if (dupCount > 0) {
      confirmMsg += `\n\n⚠️ 주의: 사원리스트에 이미 전화번호가 등록된 항목이 ${dupCount}건 포함되어 있습니다. 계속 진행하시겠습니까?`;
    }

    if (!await customConfirm(confirmMsg, '계정 일괄 생성')) {
      return;
    }

    // MemberAccount 배열 생성
    const newMembers: MemberAccount[] = targetRows.map(r => {
      // 조직명: 지사명이 있으면 지사명, 없으면 본부명, 둘 다 없으면 '미지정'
      const orgName = (r.branch || r.hq || '미지정').trim();
      return {
        role: defaultRole,
        orgName,
        username: r.systemId.trim(),
        password: r.systemPw.trim()
      };
    });

    onAddMembers(newMembers);
    alert(`성공적으로 ${newMembers.length}개의 계정이 추가되었습니다.\n[시트에 최종 저장] 버튼을 눌러 구글 시트에 최종 반영해 주세요.`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800"
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        {/* 토스트 메시지 */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg flex items-center gap-2 backdrop-blur-xs"
            >
              <Check size={14} className="text-emerald-400" />
              <span>{toastMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 모달 헤더 */}
        <div className="px-6 py-4 border-b border-slate-200 bg-linear-to-r from-cyan-50 via-slate-50 to-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-600 text-white rounded-xl shadow-md shadow-cyan-200">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900">전산코드 등록</h2>
                <span className="text-[11px] font-bold px-2 py-0.5 bg-cyan-100 text-cyan-800 rounded-full border border-cyan-300">
                  사원리스트 L열(연락처) 실시간 대사
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                엑셀 파일을 업로드하여 원클릭 복사 및 사원리스트 중복 검사 후 신규 계정을 간편하게 등록합니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadTemplate}
              className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-cyan-700 bg-white hover:bg-cyan-50 border border-slate-300 hover:border-cyan-300 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="전산코드 등록용 샘플 엑셀 파일 다운로드"
            >
              <Download size={13} className="text-cyan-600" />
              <span>양식 다운로드</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 파일 업로드 바 / 드롭존 */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 shrink-0">
          {rows.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                isDragOver 
                  ? 'border-cyan-500 bg-cyan-50/50 scale-[0.99]' 
                  : 'border-slate-300 hover:border-cyan-400 hover:bg-white'
              }`}
            >
              <Upload size={36} className="mx-auto text-cyan-600 mb-2 opacity-80" />
              <p className="text-sm font-bold text-slate-700">
                엑셀 파일을 여기에 드래그하거나 클릭하여 업로드하세요
              </p>
              <p className="text-xs text-slate-500 mt-1">
                형식: 직급(A) | 본부(B) | 지사(C) | 이름(D) | 연락처(E) | 생년월일(F) | ID(G) | PW(H)
              </p>
              <span className="inline-block mt-3 px-3 py-1 bg-cyan-600 text-white text-xs font-bold rounded-lg shadow-xs hover:bg-cyan-700">
                파일 선택 (.xlsx, .xls)
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">업로드 파일:</span>
                <span className="text-xs font-black text-slate-800 bg-white px-2.5 py-1 rounded-lg border border-slate-200 flex items-center gap-1.5 shadow-2xs">
                  <FileSpreadsheet size={13} className="text-cyan-600" />
                  {fileName || '업로드된 파일'}
                </span>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-cyan-700 bg-white hover:bg-cyan-50 border border-slate-200 rounded-lg transition-all cursor-pointer"
                >
                  파일 재업로드
                </button>
              </div>

              {/* 통계 요약 뱃지 */}
              <div className="flex items-center gap-2 text-xs">
                <div className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg shadow-2xs">
                  전체: <span className="font-bold text-slate-800">{stats.total}</span>건
                </div>
                <div className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg shadow-2xs font-medium">
                  신규 가능: <span className="font-bold text-emerald-600">{stats.newItems}</span>건
                </div>
                <div className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg shadow-2xs font-medium">
                  번호 중복: <span className="font-bold text-amber-600">{stats.duplicates}</span>건
                </div>
                {stats.orgMissing > 0 && (
                  <div className="px-2.5 py-1 bg-rose-50 border border-rose-300 text-rose-800 rounded-lg shadow-2xs font-medium flex items-center gap-1">
                    <AlertCircle size={12} className="text-rose-600 shrink-0" />
                    <span>본부/지사 미확인:</span>
                    <span className="font-black text-rose-600">{stats.orgMissing}</span>건
                  </div>
                )}
                <div className="px-2.5 py-1 bg-cyan-50 border border-cyan-200 text-cyan-800 rounded-lg shadow-2xs font-medium">
                  선택됨: <span className="font-black text-cyan-600">{stats.selectedCount}</span>건
                </div>
              </div>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls"
            onChange={handleFileInputChange}
            className="hidden"
          />
        </div>

        {/* 본문 영역: 테이블 및 컨트롤 */}
        {rows.length > 0 && (
          <>
            {/* 탭 및 검색 / 복사 툴바 */}
            <div className="px-6 py-3 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
              {/* 세그먼트 탭 */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === 'all' 
                      ? 'bg-white text-slate-900 shadow-2xs' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  전체 ({stats.total})
                </button>
                <button
                  onClick={() => setActiveTab('new')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    activeTab === 'new' 
                      ? 'bg-emerald-600 text-white shadow-2xs' 
                      : 'text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  <CheckCircle2 size={12} />
                  신규 등록 대상 ({stats.newItems})
                </button>
                <button
                  onClick={() => setActiveTab('duplicate')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    activeTab === 'duplicate' 
                      ? 'bg-amber-500 text-white shadow-2xs' 
                      : 'text-amber-700 hover:bg-amber-50'
                  }`}
                >
                  <AlertTriangle size={12} />
                  중복/확인필요 ({stats.duplicates})
                </button>
                {stats.orgMissing > 0 && (
                  <button
                    onClick={() => setActiveTab('org_missing')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                      activeTab === 'org_missing' 
                        ? 'bg-rose-600 text-white shadow-2xs' 
                        : 'text-rose-700 hover:bg-rose-50'
                    }`}
                  >
                    <AlertCircle size={12} />
                    본부·지사 미확인 ({stats.orgMissing})
                  </button>
                )}
              </div>

              {/* 검색 및 복사 액션 */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="이름, 번호, ID, 지사 검색..."
                    className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-cyan-500 focus:bg-white w-48 transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <button
                  onClick={handleCopySelectedRows}
                  className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="선택된 항목을 엑셀/외부 양식에 붙여넣을 수 있도록 TSV 형식으로 전체 복사"
                >
                  <Copy size={13} className="text-slate-600" />
                  <span>선택 항목 일괄 복사</span>
                </button>
              </div>
            </div>

            {/* 테이블 안내 및 원클릭 복사 팁 */}
            <div className="px-6 py-2 bg-cyan-50/50 border-b border-cyan-100 text-[11px] text-cyan-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Info size={13} className="text-cyan-600 shrink-0" />
                  <span>
                    <strong>원클릭 복사:</strong> 셀 클릭 시 즉시 클립보드에 복사됩니다.
                  </span>
                </div>
                <div className="flex items-center gap-1 text-rose-700 font-medium">
                  <AlertCircle size={12} className="text-rose-500 shrink-0" />
                  <span>
                    <strong>빨간색 표시:</strong> 사원리스트 시트(C열 본부명, D열 지사명)에 없는 값입니다.
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSelectAll(true)}
                  className="text-cyan-700 hover:underline font-bold cursor-pointer"
                >
                  현재 뷰 전체선택
                </button>
                <span className="text-cyan-300">|</span>
                <button
                  onClick={() => handleSelectAll(false)}
                  className="text-cyan-700 hover:underline font-bold cursor-pointer"
                >
                  전체해제
                </button>
              </div>
            </div>

            {/* 테이블 영역 */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 sticky top-0 z-10 border-b border-slate-200 text-slate-600 select-none">
                  <tr>
                    <th className="p-2.5 text-center w-10">
                      <input
                        type="checkbox"
                        checked={filteredRows.length > 0 && filteredRows.every(r => r.isSelected)}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="rounded text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                      />
                    </th>
                    <th className="p-2.5 font-bold w-20">상태</th>
                    <th className="p-2.5 font-bold w-16">직급</th>
                    <th className="p-2.5 font-bold w-24">본부</th>
                    <th className="p-2.5 font-bold w-24">지사</th>
                    <th className="p-2.5 font-bold w-24">이름</th>
                    <th className="p-2.5 font-bold w-32">연락처 (E열)</th>
                    <th className="p-2.5 font-bold w-20">생년월일</th>
                    <th className="p-2.5 font-bold w-32">전산 ID (G열)</th>
                    <th className="p-2.5 font-bold w-32">전산 PW (H열)</th>
                    <th className="p-2.5 font-bold text-center w-28">원클릭 복사</th>
                    <th className="p-2.5 font-bold text-center w-20">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map((row) => {
                    const isEditing = !!editingRows[row.id];
                    const editData = editingRows[row.id] || row;
                    const isExistingUsername = existingUsernameSet.has(row.systemId.toLowerCase());

                    return (
                      <tr
                        key={row.id}
                        className={`transition-colors ${
                          row.isDuplicate 
                            ? 'bg-amber-50/40 hover:bg-amber-50/70' 
                            : row.isSelected 
                              ? 'bg-cyan-50/20 hover:bg-cyan-50/40' 
                              : 'hover:bg-slate-50'
                        }`}
                      >
                        {/* 체크박스 */}
                        <td className="p-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={row.isSelected}
                            onChange={() => handleToggleSelect(row.id)}
                            className="rounded text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                          />
                        </td>

                        {/* 상태 뱃지 */}
                        <td className="p-2.5 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            {row.isDuplicate ? (
                              <span 
                                className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md font-bold text-[10px] border border-amber-300 inline-flex items-center gap-1 w-fit"
                                title={`사원리스트 L열 중복: ${row.matchedEmps.map(e => `${e.name}(${e.hq}/${e.branch})`).join(', ')}`}
                              >
                                <AlertTriangle size={10} className="text-amber-600 shrink-0" />
                                번호중복
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md font-bold text-[10px] border border-emerald-300 inline-flex items-center gap-1 w-fit">
                                <CheckCircle2 size={10} className="text-emerald-600 shrink-0" />
                                신규생성
                              </span>
                            )}
                            {(row.isHqMissing || row.isBranchMissing) && (
                              <span 
                                className="px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded font-bold text-[9px] border border-rose-200 inline-flex items-center gap-0.5 w-fit"
                                title="사원리스트 C열 본부명 또는 D열 지사명에 없는 조직입니다."
                              >
                                <AlertCircle size={9} className="text-rose-600 shrink-0" />
                                조직미확인
                              </span>
                            )}
                            {row.isDuplicate && row.matchedEmps.length > 0 && (
                              <span className="text-[10px] text-amber-700 truncate max-w-[90px]" title={row.matchedEmps[0].name}>
                                기존: {row.matchedEmps[0].name}
                              </span>
                            )}
                            {isExistingUsername && (
                              <span className="text-[10px] text-purple-600 font-bold" title="계정관리 목록에 동일 ID 존재">
                                ID기존존재
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 직급 (Col A) */}
                        <td className="p-2.5 whitespace-nowrap">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editData.position}
                              onChange={(e) => handleEditChange(row.id, 'position', e.target.value)}
                              className="w-16 px-1.5 py-0.5 border border-cyan-400 rounded bg-white text-xs"
                            />
                          ) : (
                            <span 
                              onClick={() => copyToClipboard(row.position, `pos_${row.id}`, '직급')}
                              className="cursor-pointer hover:text-cyan-600 hover:underline"
                              title="클릭하여 복사"
                            >
                              {row.position || '-'}
                            </span>
                          )}
                        </td>

                        {/* 본부 (Col B) */}
                        <td className="p-2.5 whitespace-nowrap">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editData.hq}
                              onChange={(e) => handleEditChange(row.id, 'hq', e.target.value)}
                              className={`w-24 px-1.5 py-0.5 border rounded text-xs ${
                                !checkIsValidHq(editData.hq)
                                  ? 'border-rose-400 bg-rose-50 text-rose-700 font-bold focus:ring-1 focus:ring-rose-500'
                                  : 'border-cyan-400 bg-white font-medium'
                              }`}
                              title={!checkIsValidHq(editData.hq) ? '사원리스트 C열에 등록되지 않은 본부명입니다' : ''}
                            />
                          ) : (
                            row.isHqMissing ? (
                              <span 
                                onClick={() => copyToClipboard(row.hq, `hq_${row.id}`, '본부')}
                                className="cursor-pointer font-black text-rose-600 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded border border-rose-300 inline-flex items-center gap-1 shadow-2xs transition-colors"
                                title="사원리스트 C열에 등록되지 않은 본부명입니다 (클릭하여 복사)"
                              >
                                <AlertTriangle size={11} className="text-rose-500 shrink-0" />
                                <span>{row.hq || '(본부 미입력)'}</span>
                              </span>
                            ) : (
                              <span 
                                onClick={() => copyToClipboard(row.hq, `hq_${row.id}`, '본부')}
                                className="cursor-pointer hover:text-cyan-600 hover:underline font-medium"
                                title="클릭하여 복사"
                              >
                                {row.hq || '-'}
                              </span>
                            )
                          )}
                        </td>

                        {/* 지사 (Col C) */}
                        <td className="p-2.5 whitespace-nowrap">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editData.branch}
                              onChange={(e) => handleEditChange(row.id, 'branch', e.target.value)}
                              className={`w-24 px-1.5 py-0.5 border rounded text-xs ${
                                !checkIsValidBranch(editData.branch)
                                  ? 'border-rose-400 bg-rose-50 text-rose-700 font-bold focus:ring-1 focus:ring-rose-500'
                                  : 'border-cyan-400 bg-white font-medium'
                              }`}
                              title={!checkIsValidBranch(editData.branch) ? '사원리스트 D열에 등록되지 않은 지사명입니다' : ''}
                            />
                          ) : (
                            row.isBranchMissing ? (
                              <span 
                                onClick={() => copyToClipboard(row.branch, `br_${row.id}`, '지사')}
                                className="cursor-pointer font-black text-rose-600 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded border border-rose-300 inline-flex items-center gap-1 shadow-2xs transition-colors"
                                title="사원리스트 D열에 등록되지 않은 지사명입니다 (클릭하여 복사)"
                              >
                                <AlertTriangle size={11} className="text-rose-500 shrink-0" />
                                <span>{row.branch || '(지사 미입력)'}</span>
                              </span>
                            ) : (
                              <span 
                                onClick={() => copyToClipboard(row.branch, `br_${row.id}`, '지사')}
                                className="cursor-pointer hover:text-cyan-600 hover:underline font-medium"
                                title="클릭하여 복사"
                              >
                                {row.branch || '-'}
                              </span>
                            )
                          )}
                        </td>

                        {/* 이름 (Col D) */}
                        <td className="p-2.5 whitespace-nowrap font-bold">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editData.name}
                              onChange={(e) => handleEditChange(row.id, 'name', e.target.value)}
                              className="w-20 px-1.5 py-0.5 border border-cyan-400 rounded bg-white text-xs font-bold"
                            />
                          ) : (
                            <div 
                              onClick={() => copyToClipboard(row.name, `name_${row.id}`, '이름')}
                              className="cursor-pointer group flex items-center gap-1 hover:text-cyan-600"
                              title="클릭하여 이름 복사"
                            >
                              <span className="group-hover:underline">{row.name}</span>
                              <Copy size={11} className="opacity-0 group-hover:opacity-100 text-cyan-600 transition-opacity" />
                            </div>
                          )}
                        </td>

                        {/* 연락처 (Col E) */}
                        <td className="p-2.5 whitespace-nowrap font-mono">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editData.phone}
                              onChange={(e) => handleEditChange(row.id, 'phone', e.target.value)}
                              placeholder="010-0000-0000"
                              className="w-28 px-1.5 py-0.5 border border-cyan-400 rounded bg-white text-xs font-mono"
                            />
                          ) : (
                            <div
                              onClick={() => copyToClipboard(row.phone, `phone_${row.id}`, '연락처')}
                              className={`cursor-pointer group flex items-center gap-1 hover:text-cyan-600 ${
                                row.isDuplicate ? 'text-amber-700 font-bold' : 'text-slate-700'
                              }`}
                              title="클릭하여 연락처 복사"
                            >
                              <span className="group-hover:underline">{formatPhone(row.phone)}</span>
                              {copiedCellId === `phone_${row.id}` ? (
                                <Check size={11} className="text-emerald-600" />
                              ) : (
                                <Copy size={11} className="opacity-0 group-hover:opacity-100 text-cyan-600 transition-opacity" />
                              )}
                            </div>
                          )}
                        </td>

                        {/* 생년월일 (Col F) */}
                        <td className="p-2.5 whitespace-nowrap font-mono text-slate-600">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editData.birthDate}
                              onChange={(e) => handleEditChange(row.id, 'birthDate', e.target.value)}
                              className="w-16 px-1.5 py-0.5 border border-cyan-400 rounded bg-white text-xs font-mono"
                            />
                          ) : (
                            <span 
                              onClick={() => copyToClipboard(row.birthDate, `birth_${row.id}`, '생년월일')}
                              className="cursor-pointer hover:text-cyan-600 hover:underline"
                              title="클릭하여 복사"
                            >
                              {row.birthDate || '-'}
                            </span>
                          )}
                        </td>

                        {/* 전산 ID (Col G) */}
                        <td className="p-2.5 whitespace-nowrap font-mono">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editData.systemId}
                              onChange={(e) => handleEditChange(row.id, 'systemId', e.target.value)}
                              className="w-28 px-1.5 py-0.5 border border-cyan-400 rounded bg-white text-xs font-mono font-bold"
                            />
                          ) : (
                            <div
                              onClick={() => copyToClipboard(row.systemId, `id_${row.id}`, 'ID')}
                              className="cursor-pointer group flex items-center gap-1 hover:text-cyan-600 font-bold text-slate-800"
                              title="클릭하여 ID 복사"
                            >
                              <span className="group-hover:underline">{row.systemId}</span>
                              {copiedCellId === `id_${row.id}` ? (
                                <Check size={11} className="text-emerald-600" />
                              ) : (
                                <Copy size={11} className="opacity-0 group-hover:opacity-100 text-cyan-600 transition-opacity" />
                              )}
                            </div>
                          )}
                        </td>

                        {/* 전산 PW (Col H) */}
                        <td className="p-2.5 whitespace-nowrap font-mono">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editData.systemPw}
                              onChange={(e) => handleEditChange(row.id, 'systemPw', e.target.value)}
                              className="w-28 px-1.5 py-0.5 border border-cyan-400 rounded bg-white text-xs font-mono"
                            />
                          ) : (
                            <div
                              onClick={() => copyToClipboard(row.systemPw, `pw_${row.id}`, 'PW')}
                              className="cursor-pointer group flex items-center gap-1 hover:text-cyan-600 text-slate-600"
                              title="클릭하여 PW 복사"
                            >
                              <span className="group-hover:underline">{row.systemPw}</span>
                              {copiedCellId === `pw_${row.id}` ? (
                                <Check size={11} className="text-emerald-600" />
                              ) : (
                                <Copy size={11} className="opacity-0 group-hover:opacity-100 text-cyan-600 transition-opacity" />
                              )}
                            </div>
                          )}
                        </td>

                        {/* 원클릭 복사 버튼 모음 */}
                        <td className="p-2.5 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleCopyIdPw(row)}
                              className="px-1.5 py-1 text-[11px] font-bold bg-slate-100 hover:bg-cyan-100 text-slate-700 hover:text-cyan-800 rounded border border-slate-200 transition-all cursor-pointer flex items-center gap-0.5 shadow-2xs"
                              title="ID와 PW를 탭(Tab) 구분으로 복사 (전산 로그인 폼 빠른 입력용)"
                            >
                              {copiedCellId === `idpw_${row.id}` ? (
                                <Check size={11} className="text-emerald-600" />
                              ) : (
                                <Copy size={11} className="text-slate-500" />
                              )}
                              <span>ID/PW</span>
                            </button>

                            <button
                              onClick={() => handleCopyRow(row)}
                              className="px-1.5 py-1 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-200 transition-all cursor-pointer flex items-center gap-0.5 shadow-2xs"
                              title="행 전체를 탭 구분 텍스트로 복사 (엑셀 등에 붙여넣기용)"
                            >
                              {copiedCellId === `row_${row.id}` ? (
                                <Check size={11} className="text-emerald-600" />
                              ) : (
                                <Copy size={11} className="text-slate-500" />
                              )}
                              <span>행 전체</span>
                            </button>
                          </div>
                        </td>

                        {/* 관리 (수정 / 삭제) */}
                        <td className="p-2.5 text-center whitespace-nowrap">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleSaveEdit(row.id)}
                                className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 cursor-pointer"
                                title="수정 저장"
                              >
                                <Check size={13} />
                              </button>
                              <button
                                onClick={() => handleCancelEdit(row.id)}
                                className="p-1 bg-slate-300 text-slate-700 rounded hover:bg-slate-400 cursor-pointer"
                                title="수정 취소"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleStartEdit(row)}
                                className="p-1 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded transition-all cursor-pointer"
                                title="행 내용 직접 수정"
                              >
                                <Edit3 size={13} />
                              </button>
                              <button
                                onClick={() => handleDeleteRow(row.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all cursor-pointer"
                                title="목록에서 삭제"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {filteredRows.length === 0 && (
                <div className="p-12 text-center text-slate-400">
                  <AlertTriangle size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-bold">조건에 해당하는 데이터가 없습니다.</p>
                  <p className="text-xs mt-1">검색어를 변경하거나 다른 탭을 선택해 보세요.</p>
                </div>
              )}
            </div>

            {/* 모달 푸터 */}
            <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="font-bold">계정 생성 시 부여 역할:</span>
                  <select
                    value={defaultRole}
                    onChange={(e) => setDefaultRole(e.target.value)}
                    className="px-2 py-1 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-cyan-500 font-bold"
                  >
                    <option value="영업사원">영업사원 (기본)</option>
                    <option value="지사">지사</option>
                    <option value="본부">본부</option>
                    <option value="총무">총무</option>
                    <option value="관리자">관리자</option>
                  </select>
                </div>
                <span className="text-xs text-slate-400">|</span>
                <span className="text-xs text-slate-500">
                  조직명은 엑셀의 <strong>지사</strong>(없을 시 본부)로 자동 배정됩니다.
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
                >
                  닫기
                </button>
                <button
                  onClick={handleCreateAccounts}
                  disabled={stats.selectedCount === 0}
                  className={`px-5 py-2 text-xs font-black rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer ${
                    stats.selectedCount > 0
                      ? 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-cyan-200 hover:scale-102'
                      : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <UserPlus size={15} />
                  <span>선택한 {stats.selectedCount}개 계정 신규 생성</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

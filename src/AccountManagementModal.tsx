import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, UserCheck, Plus, Search, Trash2, Edit3, Eye, EyeOff, 
  Download, Upload, CheckCircle, AlertTriangle, RefreshCw, 
  Building2, User, FileSpreadsheet
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const XLSX = (window as any).XLSX;

export interface MemberAccount {
  role: string;
  orgName: string;
  username: string;
  password: string;
}

interface AccountManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: MemberAccount[];
  onSaveMembers: (updatedMembers: MemberAccount[]) => Promise<boolean>;
  availableHqs: string[];
  availableBranches?: string[];
  currentUser: { username: string; role: string; orgName: string } | null;
}

const PRESET_ROLES = [
  { value: '관리자', label: '관리자 (전체 권한)', desc: '시스템 및 전체 본부/지사 관리' },
  { value: '총무', label: '총무 (관리자급 열람/수정)', desc: '정산 및 계약 전반 관리' },
  { value: '본부', label: '본부 (본부장/관리자)', desc: '소속 본부 및 산하 지사 데이터 관리' },
  { value: '지사', label: '지사 (지사장/지사관리)', desc: '소속 지사 데이터 관리' },
  { value: '영업사원', label: '영업사원 (개인 실적)', desc: '개인 실적 조회' },
  { value: '본부모바일', label: '본부모바일 (모바일 전용)', desc: '모바일 본부 뷰' },
  { value: '지사모바일', label: '지사모바일 (모바일 전용)', desc: '모바일 지사 뷰' },
];

export function AccountManagementModal({
  isOpen,
  onClose,
  members: initialMembers,
  onSaveMembers,
  availableHqs,
  availableBranches = [],
  currentUser
}: AccountManagementModalProps) {
  const [members, setMembers] = useState<MemberAccount[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('전체');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // 신규 등록 폼 상태
  const [newRole, setNewRole] = useState('본부');
  const [newOrgType, setNewOrgType] = useState<'hq' | 'branch' | 'custom'>('hq');
  const [selectedOrgDropdown, setSelectedOrgDropdown] = useState('');
  const [customOrgInput, setCustomOrgInput] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // 수정 모달 상태
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<MemberAccount>({ role: '', orgName: '', username: '', password: '' });
  const [showEditPassword, setShowEditPassword] = useState(false);

  // 비밀번호 표시 여부 맵 (idx -> boolean)
  const [visiblePasswords, setVisiblePasswords] = useState<{ [key: number]: boolean }>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setMembers(JSON.parse(JSON.stringify(initialMembers)));
      setHasChanges(false);
      setSearchTerm('');
      setSelectedRoleFilter('전체');
    }
  }, [isOpen, initialMembers]);

  // 본부 및 지사 목록 정제
  const cleanHqs = useMemo(() => {
    return Array.from(new Set(availableHqs.filter(h => h && h !== '전체'))).sort();
  }, [availableHqs]);

  const cleanBranches = useMemo(() => {
    return Array.from(new Set(availableBranches.filter(b => b && b !== '전체'))).sort();
  }, [availableBranches]);

  // 권한별 카운트 계산
  const roleCounts = useMemo(() => {
    const counts: { [key: string]: number } = { 전체: members.length };
    PRESET_ROLES.forEach(r => {
      counts[r.value] = members.filter(m => m.role === r.value).length;
    });
    // 기타
    const presetValues = PRESET_ROLES.map(r => r.value);
    counts['기타'] = members.filter(m => !presetValues.includes(m.role)).length;
    return counts;
  }, [members]);

  // 필터링된 계정 목록
  const filteredMembers = useMemo(() => {
    return members
      .map((member, originalIndex) => ({ member, originalIndex }))
      .filter(({ member }) => {
        // 권한 필터
        if (selectedRoleFilter !== '전체') {
          if (selectedRoleFilter === '기타') {
            const presetValues = PRESET_ROLES.map(r => r.value);
            if (presetValues.includes(member.role)) return false;
          } else if (member.role !== selectedRoleFilter) {
            return false;
          }
        }
        // 검색어 필터
        if (searchTerm.trim()) {
          const q = searchTerm.trim().toLowerCase();
          const matchUsername = (member.username || '').toLowerCase().includes(q);
          const matchOrg = (member.orgName || '').toLowerCase().includes(q);
          const matchRole = (member.role || '').toLowerCase().includes(q);
          if (!matchUsername && !matchOrg && !matchRole) return false;
        }
        return true;
      });
  }, [members, selectedRoleFilter, searchTerm]);

  // 계정 등록 처리
  const handleAddMember = () => {
    if (!newRole) {
      alert('구분(권한)을 선택해 주세요.');
      return;
    }
    const finalOrgName = newRole === '관리자' ? '본사/전체' : (newOrgType === 'custom' ? customOrgInput.trim() : selectedOrgDropdown);
    if (!finalOrgName) {
      alert('소속 조직명을 선택하거나 입력해 주세요.');
      return;
    }
    if (!newUsername.trim()) {
      alert('로그인 아이디를 입력해 주세요.');
      return;
    }
    if (!newPassword.trim()) {
      alert('비밀번호를 입력해 주세요.');
      return;
    }

    const trimmedUsername = newUsername.trim();
    if (members.some(m => m.username.toLowerCase() === trimmedUsername.toLowerCase())) {
      alert(`이미 등록된 아이디입니다: ${trimmedUsername}`);
      return;
    }

    const created: MemberAccount = {
      role: newRole,
      orgName: finalOrgName,
      username: trimmedUsername,
      password: newPassword.trim()
    };

    setMembers([created, ...members]);
    setHasChanges(true);
    setNewUsername('');
    setNewPassword('');
    alert(`계정 [${trimmedUsername}]이(가) 등록 목록에 추가되었습니다.\n최종 적용을 위해 상단의 [시트에 최종 저장] 버튼을 눌러주세요.`);
  };

  // 계정 삭제
  const handleDelete = async (origIdx: number) => {
    const target = members[origIdx];
    if (!target) return;
    if (target.username === currentUser?.username) {
      alert('현재 로그인 중인 본인 계정은 삭제할 수 없습니다.');
      return;
    }
    if (confirm(`정말 계정 [${target.username}] (${target.orgName} / ${target.role})을 삭제하시겠습니까?`)) {
      const updated = members.filter((_, idx) => idx !== origIdx);
      setMembers(updated);
      setHasChanges(true);
    }
  };

  // 계정 수정 시작
  const startEditing = (origIdx: number) => {
    setEditingIndex(origIdx);
    setEditForm({ ...members[origIdx] });
    setShowEditPassword(false);
  };

  // 수정 적용
  const applyEdit = () => {
    if (editingIndex === null) return;
    if (!editForm.role.trim() || !editForm.orgName.trim() || !editForm.username.trim() || !editForm.password.trim()) {
      alert('모든 필수 항목을 입력해 주세요.');
      return;
    }

    // 아이디 중복 체크 (자신 제외)
    const duplicate = members.some((m, idx) => idx !== editingIndex && m.username.toLowerCase() === editForm.username.trim().toLowerCase());
    if (duplicate) {
      alert('이미 다른 회원이 사용 중인 아이디입니다.');
      return;
    }

    const updated = [...members];
    updated[editingIndex] = {
      ...editForm,
      username: editForm.username.trim(),
      orgName: editForm.orgName.trim(),
      role: editForm.role.trim(),
      password: editForm.password.trim()
    };
    setMembers(updated);
    setHasChanges(true);
    setEditingIndex(null);
  };

  // 서버/시트에 최종 저장
  const handleSaveToSheet = async () => {
    if (members.length === 0) {
      if (!confirm('현재 등록된 계정이 0개입니다. 그대로 저장하면 모든 계정이 삭제됩니다. 진행하시겠습니까?')) {
        return;
      }
    }
    setIsSaving(true);
    try {
      const success = await onSaveMembers(members);
      if (success) {
        setHasChanges(false);
        alert('계정 정보가 구글 시트 [조직계정설정]에 성공적으로 반영되었습니다.');
      }
    } catch (err) {
      console.error(err);
      alert('저장 도중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  // 엑셀 템플릿 다운로드
  const handleDownloadTemplate = () => {
    if (!XLSX) return alert('XLSX 라이브러리가 로드되지 않았습니다.');
    const templateData = [
      ['구분', '조직명', '아이디', '비밀번호'],
      ['본부', '강남본부', 'gangnam01', '1234'],
      ['지사', '역삼지사', 'yeoksam01', '1234'],
      ['관리자', '본사/전체', 'admin02', 'admin1234!'],
      ['영업사원', '홍길동', 'sales001', '1234']
    ];
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '계정등록양식');
    XLSX.writeFile(wb, '계정일괄등록_양식.xlsx');
  };

  // 현재 계정 엑셀 백업 다운로드
  const handleExportExcel = () => {
    if (!XLSX) return alert('XLSX 라이브러리가 로드되지 않았습니다.');
    const dataRows = [
      ['구분', '조직명', '아이디', '비밀번호'],
      ...members.map(m => [m.role, m.orgName, m.username, m.password])
    ];
    const ws = XLSX.utils.aoa_to_sheet(dataRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '조직계정목록');
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `계정목록_백업_${today}.xlsx`);
  };

  // 엑셀 일괄 업로드 처리
  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (!rows || rows.length <= 1) {
          alert('엑셀에 등록할 계정 데이터가 없습니다.');
          return;
        }

        // 헤더 검증
        const header = rows[0].map((h: any) => String(h || '').trim());
        let roleIdx = header.indexOf('구분');
        let orgIdx = header.indexOf('조직명');
        let userIdx = header.indexOf('아이디');
        let pwIdx = header.indexOf('비밀번호');

        if (roleIdx === -1) roleIdx = 0;
        if (orgIdx === -1) orgIdx = 1;
        if (userIdx === -1) userIdx = 2;
        if (pwIdx === -1) pwIdx = 3;

        const existingUserMap = new Map(members.map(m => [m.username.toLowerCase(), m]));

        let addedCount = 0;
        let updatedCount = 0;

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const role = String(row[roleIdx] || '').trim();
          const orgName = String(row[orgIdx] || '').trim();
          const username = String(row[userIdx] || '').trim();
          const password = String(row[pwIdx] || '').trim();

          if (!username) continue; // 아이디가 없으면 스킵

          const newAcc: MemberAccount = {
            role: role || '지사',
            orgName: orgName || '미지정',
            username,
            password: password || '1234'
          };

          if (existingUserMap.has(username.toLowerCase())) {
            updatedCount++;
          } else {
            addedCount++;
          }
          existingUserMap.set(username.toLowerCase(), newAcc);
        }

        const mergedList = Array.from(existingUserMap.values());
        setMembers(mergedList);
        setHasChanges(true);
        alert(`엑셀 업로드 완료!\n신규 추가: ${addedCount}건 / 기존 갱신: ${updatedCount}건\n최종 반영을 위해 [시트에 최종 저장] 버튼을 눌러주세요.`);
      } catch (error) {
        console.error('엑셀 파싱 실패:', error);
        alert('엑셀 파일을 읽는 중 오류가 발생했습니다. 양식을 확인해 주세요.');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      {/* 배경 오버레이 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => {
          if (hasChanges) {
            if (confirm('저장되지 않은 변경 사항이 있습니다. 닫으시겠습니까?')) {
              onClose();
            }
          } else {
            onClose();
          }
        }}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
      />

      {/* 모달 본체 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        className="relative bg-slate-50 rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden z-10"
      >
        {/* 모달 상단 헤더 */}
        <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 shadow-2xs">
              <UserCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900 tracking-tight">ERP 조직 계정 관리</h2>
                <span className="text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full border border-slate-200">
                  총 {members.length}개 계정
                </span>
                {hasChanges && (
                  <span className="text-xs font-bold px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded-full border border-amber-300 animate-pulse flex items-center gap-1">
                    <AlertTriangle size={12} /> 저장되지 않은 변경사항 있음
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                로그인 권한, 본부/지사 소속 조직 및 비밀번호를 설정하고 구글 시트와 실시간 연동합니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 엑셀 관련 액션 버튼 */}
            <div className="hidden sm:flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={handleDownloadTemplate}
                className="px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:text-blue-600 hover:bg-white rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                title="일괄 등록용 엑셀 양식 다운로드"
              >
                <Download size={13} />
                양식 받기
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:text-emerald-600 hover:bg-white rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                title="엑셀 파일로 대량 계정 일괄 등록/갱신"
              >
                <Upload size={13} />
                엑셀 일괄등록
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls"
                onChange={handleImportExcel}
                className="hidden"
              />
              <button
                onClick={handleExportExcel}
                className="px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-white rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                title="현재 계정 목록 엑셀 백업"
              >
                <FileSpreadsheet size={13} />
                백업 다운로드
              </button>
            </div>

            {/* 시트 저장 버튼 */}
            <button
              onClick={handleSaveToSheet}
              disabled={isSaving}
              className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all cursor-pointer ${
                hasChanges 
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200 scale-102 ring-2 ring-emerald-400' 
                  : 'bg-slate-800 hover:bg-slate-900 text-white'
              }`}
            >
              {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {isSaving ? '시트 저장 중...' : '시트에 최종 저장'}
            </button>

            {/* 닫기 버튼 */}
            <button
              onClick={() => {
                if (hasChanges && !confirm('저장되지 않은 변경 사항이 있습니다. 닫으시겠습니까?')) return;
                onClose();
              }}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer ml-1"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 바디 컨텐츠 영역 (스크롤) */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          
          {/* 1. 신규 계정 간편 등록 카드 */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                  <Plus size={16} />
                </span>
                <h3 className="text-sm font-black text-slate-800">신규 계정 간편 등록</h3>
                <span className="text-[11px] text-slate-400 font-medium">
                  권한과 소속 조직을 선택하고 로그인 계정을 생성합니다.
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              {/* 구분 (권한) */}
              <div className="md:col-span-3">
                <label className="block text-[11px] font-black text-slate-600 mb-1">
                  1. 권한 (구분) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={newRole}
                  onChange={(e) => {
                    const role = e.target.value;
                    setNewRole(role);
                    if (role === '본부' || role === '본부모바일') {
                      setNewOrgType('hq');
                      if (cleanHqs.length > 0) setSelectedOrgDropdown(cleanHqs[0]);
                    } else if (role === '지사' || role === '지사모바일') {
                      setNewOrgType('branch');
                      if (cleanBranches.length > 0) setSelectedOrgDropdown(cleanBranches[0]);
                    } else if (role === '관리자' || role === '총무') {
                      setNewOrgType('custom');
                      setCustomOrgInput('본사/전체');
                    } else {
                      setNewOrgType('custom');
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                >
                  {PRESET_ROLES.map(r => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 소속 조직명 */}
              <div className="md:col-span-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-black text-slate-600">
                    2. 소속 조직명 <span className="text-rose-500">*</span>
                  </label>
                  {newRole !== '관리자' && (
                    <div className="flex gap-1 text-[10px] font-bold">
                      <button
                        type="button"
                        onClick={() => {
                          setNewOrgType('hq');
                          if (cleanHqs.length > 0) setSelectedOrgDropdown(cleanHqs[0]);
                        }}
                        className={`px-1.5 py-0.5 rounded cursor-pointer ${newOrgType === 'hq' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                      >
                        본부
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewOrgType('branch');
                          if (cleanBranches.length > 0) setSelectedOrgDropdown(cleanBranches[0]);
                        }}
                        className={`px-1.5 py-0.5 rounded cursor-pointer ${newOrgType === 'branch' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                      >
                        지사
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewOrgType('custom')}
                        className={`px-1.5 py-0.5 rounded cursor-pointer ${newOrgType === 'custom' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                      >
                        직접입력
                      </button>
                    </div>
                  )}
                </div>

                {newRole === '관리자' ? (
                  <input
                    type="text"
                    disabled
                    value="본사/전체 (전체 열람)"
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-500 outline-none cursor-not-allowed"
                  />
                ) : newOrgType === 'hq' ? (
                  <select
                    value={selectedOrgDropdown}
                    onChange={(e) => setSelectedOrgDropdown(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                  >
                    <option value="">본부 선택...</option>
                    {cleanHqs.map(hq => (
                      <option key={hq} value={hq}>{hq}</option>
                    ))}
                  </select>
                ) : newOrgType === 'branch' ? (
                  <select
                    value={selectedOrgDropdown}
                    onChange={(e) => setSelectedOrgDropdown(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                  >
                    <option value="">지사 선택...</option>
                    {cleanBranches.map(br => (
                      <option key={br} value={br}>{br}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="조직명 직접 입력 (예: 강남본부, 홍길동)"
                    value={customOrgInput}
                    onChange={(e) => setCustomOrgInput(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none placeholder:font-normal"
                  />
                )}
              </div>

              {/* 아이디 */}
              <div className="md:col-span-2">
                <label className="block text-[11px] font-black text-slate-600 mb-1">
                  3. 로그인 아이디 <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="예: hq_gangnam"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value.trim())}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none placeholder:font-normal placeholder:text-slate-400"
                  />
                  {newUsername && members.some(m => m.username.toLowerCase() === newUsername.toLowerCase()) && (
                    <span className="absolute -bottom-5 left-0 text-[10px] font-bold text-rose-500">
                      이미 존재하는 아이디
                    </span>
                  )}
                </div>
              </div>

              {/* 비밀번호 */}
              <div className="md:col-span-2">
                <label className="block text-[11px] font-black text-slate-600 mb-1">
                  4. 비밀번호 <span className="text-rose-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    placeholder="비밀번호"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showNewPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* 추가 버튼 */}
              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={handleAddMember}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer h-[38px]"
                >
                  <Plus size={15} />
                  계정 등록
                </button>
              </div>
            </div>
          </div>

          {/* 2. 계정 목록 및 필터링 영역 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            
            {/* 권한별 탭 바 및 검색창 */}
            <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* 권한 탭 */}
              <div className="flex flex-wrap items-center gap-1">
                {['전체', '관리자', '총무', '본부', '지사', '영업사원', '기타'].map(roleTab => (
                  <button
                    key={roleTab}
                    onClick={() => setSelectedRoleFilter(roleTab)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      selectedRoleFilter === roleTab
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-100'
                    }`}
                  >
                    <span>{roleTab}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      selectedRoleFilter === roleTab ? 'bg-slate-800 text-blue-300' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {roleCounts[roleTab] || 0}
                    </span>
                  </button>
                ))}
              </div>

              {/* 검색창 */}
              <div className="relative min-w-[240px] md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="아이디, 조직명, 권한 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-100 outline-none"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* 계정 목록 테이블 */}
            <div className="overflow-x-auto max-h-[460px] custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100/80 text-slate-600 font-black sticky top-0 z-10 border-b border-slate-200 select-none">
                  <tr>
                    <th className="px-4 py-3 text-center w-12">No</th>
                    <th className="px-4 py-3 text-center w-28">구분 (권한)</th>
                    <th className="px-4 py-3">소속 조직명</th>
                    <th className="px-4 py-3">로그인 아이디</th>
                    <th className="px-4 py-3">비밀번호</th>
                    <th className="px-4 py-3 text-center w-28">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-16 text-center text-slate-400 font-bold bg-slate-50/30">
                        {searchTerm ? '검색 결과와 일치하는 계정이 없습니다.' : '등록된 계정이 없습니다.'}
                      </td>
                    </tr>
                  ) : (
                    filteredMembers.map(({ member, originalIndex }, seq) => {
                      const isPwdVisible = !!visiblePasswords[originalIndex];
                      const isCurrentUser = member.username === currentUser?.username;

                      return (
                        <tr 
                          key={`${member.username}-${originalIndex}`}
                          className={`hover:bg-slate-50/80 transition-colors ${isCurrentUser ? 'bg-blue-50/40' : ''}`}
                        >
                          {/* 번호 */}
                          <td className="px-4 py-3 text-center text-slate-400 font-mono text-[11px]">
                            {seq + 1}
                          </td>

                          {/* 권한 뱃지 */}
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-black ${
                              member.role.includes('관리자') ? 'bg-rose-100 text-rose-700 border border-rose-200' :
                              member.role.includes('총무') ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                              member.role.includes('본부') ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                              member.role.includes('지사') ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                              member.role.includes('영업사원') ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                              'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}>
                              {member.role}
                            </span>
                          </td>

                          {/* 조직명 */}
                          <td className="px-4 py-3 font-bold text-slate-800">
                            <div className="flex items-center gap-1.5">
                              <Building2 size={13} className="text-slate-400 shrink-0" />
                              <span>{member.orgName}</span>
                            </div>
                          </td>

                          {/* 아이디 */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <User size={13} className="text-blue-500 shrink-0" />
                              <span className="font-mono font-black text-blue-600">{member.username}</span>
                              {isCurrentUser && (
                                <span className="text-[10px] bg-blue-600 text-white font-bold px-1.5 py-0.2 rounded-full">
                                  내 계정
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 비밀번호 */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-slate-700 font-bold bg-slate-100 px-2 py-0.5 rounded border border-slate-200 min-w-[80px] text-center">
                                {isPwdVisible ? member.password : '••••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setVisiblePasswords(prev => ({
                                    ...prev,
                                    [originalIndex]: !prev[originalIndex]
                                  }));
                                }}
                                className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-200/50 cursor-pointer"
                                title={isPwdVisible ? '비밀번호 가리기' : '비밀번호 확인'}
                              >
                                {isPwdVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                              </button>
                            </div>
                          </td>

                          {/* 관리 액션 */}
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => startEditing(originalIndex)}
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all cursor-pointer"
                                title="계정 정보 수정"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                onClick={() => handleDelete(originalIndex)}
                                disabled={isCurrentUser}
                                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                  isCurrentUser 
                                    ? 'text-slate-300 cursor-not-allowed' 
                                    : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                                }`}
                                title={isCurrentUser ? '현재 로그인된 계정은 삭제할 수 없습니다.' : '계정 삭제'}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* 테이블 하단 푸터 */}
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
              <div>
                표시 중: <span className="font-bold text-slate-800">{filteredMembers.length}</span> / 전체 {members.length}명
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span>💡 엑셀 일괄 등록으로 다수의 계정을 한 번에 등록하거나 수정할 수 있습니다.</span>
              </div>
            </div>

          </div>

        </div>

      </motion.div>

      {/* 계정 수정 서브 모달 */}
      <AnimatePresence>
        {editingIndex !== null && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingIndex(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-2xs"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 w-full max-w-md z-10 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Edit3 size={18} className="text-blue-600" />
                  계정 정보 수정
                </h3>
                <button
                  onClick={() => setEditingIndex(null)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-black text-slate-600 mb-1">구분 (권한)</label>
                  <input
                    type="text"
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                    placeholder="예: 본부, 지사, 총무, 관리자"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-black text-slate-600 mb-1">소속 조직명</label>
                  <input
                    type="text"
                    value={editForm.orgName}
                    onChange={(e) => setEditForm({ ...editForm, orgName: e.target.value })}
                    placeholder="예: 강남본부, 역삼지사"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-black text-slate-600 mb-1">로그인 아이디</label>
                  <input
                    type="text"
                    value={editForm.username}
                    onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-black text-slate-600 mb-1">비밀번호</label>
                  <div className="relative flex items-center">
                    <input
                      type={showEditPassword ? 'text' : 'password'}
                      value={editForm.password}
                      onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                      className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditPassword(!showEditPassword)}
                      className="absolute right-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showEditPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingIndex(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={applyEdit}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl text-xs shadow-sm transition-colors cursor-pointer"
                >
                  수정 내용 적용
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

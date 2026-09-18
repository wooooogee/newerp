import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, UserCheck, Plus, Search, Trash2, Edit3, Eye, EyeOff, 
  Download, Upload, CheckCircle, AlertTriangle, RefreshCw, 
  Building2, User, FileSpreadsheet, Check, ChevronDown, Layers, Sparkles, UserX
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AutoAccountGeneratorModal } from './AutoAccountGeneratorModal';
import { MissingAccountCleanupModal, EmpRowData } from './MissingAccountCleanupModal';
import { customConfirm } from './CustomDialog';

const XLSX = (window as any).XLSX;

export interface MemberAccount {
  role: string;
  orgName: string;
  username: string;
  password: string;
}

// 아이디별로 통합된 계정 정보 인터페이스
interface GroupedAccount {
  username: string;
  password: string;
  primaryRole: string;
  orgEntries: { role: string; orgName: string }[];
  originalIndices: number[];
}

interface AccountManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: MemberAccount[];
  onSaveMembers: (updatedMembers: MemberAccount[]) => Promise<boolean>;
  availableHqs: string[];
  availableBranches?: string[];
  currentUser: { username: string; role: string; orgName: string } | null;
  hqSettings?: { hqName: string; isActive?: boolean }[];
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
  currentUser,
  hqSettings = []
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

  // 다중 조직 할당 모달 상태
  const [assignModalAccount, setAssignModalAccount] = useState<GroupedAccount | null>(null);
  const [assignSearch, setAssignSearch] = useState('');
  const [assignHqStatusFilter, setAssignHqStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [branchHqScope, setBranchHqScope] = useState<string>('AUTO'); // 'AUTO' | 'ALL' | 특정 본부명

  // 단일 계정 수정 모달 상태
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<MemberAccount>({ role: '', orgName: '', username: '', password: '' });
  const [showEditPassword, setShowEditPassword] = useState(false);

  // 비밀번호 표시 여부 맵 (username -> boolean)
  const [visiblePasswords, setVisiblePasswords] = useState<{ [username: string]: boolean }>({});

  // 계정 자동 생성 모달 상태
  const [isAutoGeneratorOpen, setIsAutoGeneratorOpen] = useState(false);

  // 사원리스트 미존재 계정 일괄 정리 모달 상태
  const [isMissingCleanupOpen, setIsMissingCleanupOpen] = useState(false);
  const [isRefreshingEmpSheet, setIsRefreshingEmpSheet] = useState(false);

  // 테이블 페이지네이션 상태 (대용량 1,000건 렌더링 성능 최적화)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);

  // 사원리스트 시트 기반 52개 본부 목록, 소속 지사 매핑 데이터 및 전체 사원 행 데이터
  const [empSheetHqs, setEmpSheetHqs] = useState<string[]>([]);
  const [empSheetHqToBranches, setEmpSheetHqToBranches] = useState<Record<string, string[]>>({});
  const [empSheetRows, setEmpSheetRows] = useState<EmpRowData[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 사원리스트 시트 데이터 로딩 (본부 52개 목록, 지사 매핑 및 사원 전체 데이터)
  const fetchEmpSheet = async () => {
    setIsRefreshingEmpSheet(true);
    try {
      const res = await fetch(`/api/sheets/sheetData?sheetName=${encodeURIComponent('사원리스트')}&forceFresh=true&t=${Date.now()}`);
      if (!res.ok) return;
      const data = await res.json();
      const rows = Array.isArray(data) ? data : (data.rows || []);

      const hqBranchesMap: Record<string, Set<string>> = {};
      const orderedHqs: string[] = [];
      const parsedEmpRows: EmpRowData[] = [];

      rows.slice(1).forEach((r: any[]) => {
        const no = String(r[0] || '').trim();
        const code = String(r[1] || '').trim();
        const hq = String(r[2] || '').trim();
        const branch = String(r[3] || '').trim();
        const branchOffice = String(r[4] || '').trim();
        const name = String(r[5] || '').trim();
        const resNo = String(r[6] || '').trim();
        const position = String(r[7] || '').trim();
        const status = String(r[8] || '').trim();
        const empType = String(r[9] || '').trim();
        const phone = String(r[11] || '').trim();

        if (hq && hq !== '-' && hq !== '본부') {
          if (!hqBranchesMap[hq]) {
            hqBranchesMap[hq] = new Set();
            orderedHqs.push(hq);
          }
          if (branch && branch !== '-' && branch !== '지사') {
            hqBranchesMap[hq].add(branch);
          }
          parsedEmpRows.push({
            no, code, hq, branch, branchOffice, name, resNo, position, status, empType, phone
          });
        }
      });

      const sortedHqs = Array.from(new Set(orderedHqs)).sort((a, b) => a.localeCompare(b, 'ko-KR'));
      const finalMap: Record<string, string[]> = {};
      Object.keys(hqBranchesMap).forEach(h => {
        finalMap[h] = Array.from(hqBranchesMap[h]).sort((a, b) => a.localeCompare(b, 'ko-KR'));
      });

      setEmpSheetHqs(sortedHqs);
      setEmpSheetHqToBranches(finalMap);
      setEmpSheetRows(parsedEmpRows);
    } catch (err) {
      console.error('사원리스트 데이터 로딩 실패:', err);
    } finally {
      setIsRefreshingEmpSheet(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchEmpSheet();
    }
  }, [isOpen]);

  // 사원리스트에 없는 계정(미존재/퇴사/삭제 계정) 감지 건수 계산
  const missingAccountCount = useMemo(() => {
    if (empSheetRows.length === 0 || members.length === 0) return 0;

    const phoneSet = new Set<string>();
    const codeSet = new Set<string>();
    const hqSet = new Set<string>();
    const branchSet = new Set<string>();
    const retiredPhoneSet = new Set<string>();
    const retiredCodeSet = new Set<string>();

    empSheetRows.forEach(emp => {
      if (emp.hq && emp.hq !== '-') hqSet.add(emp.hq.trim());
      if (emp.branch && emp.branch !== '-') branchSet.add(emp.branch.trim());
      if (emp.code) codeSet.add(emp.code.trim().toUpperCase());

      let cleanPhone = emp.phone.replace(/[^0-9]/g, '');
      if (cleanPhone.length === 10 && cleanPhone.startsWith('10')) cleanPhone = '0' + cleanPhone;
      if (cleanPhone.length >= 10 && cleanPhone.startsWith('01')) {
        phoneSet.add(cleanPhone);
        const statusClean = (emp.status || '').trim();
        if (statusClean.includes('퇴사') || statusClean.includes('해촉') || statusClean.includes('중지')) {
          retiredPhoneSet.add(cleanPhone);
          if (emp.code) retiredCodeSet.add(emp.code.trim().toUpperCase());
        }
      }
    });

    const userMap = new Map<string, { username: string; primaryRole: string; orgs: string[] }>();
    members.forEach(m => {
      const uname = (m.username || '').trim();
      if (!uname) return;
      const lower = uname.toLowerCase();
      if (!userMap.has(lower)) {
        userMap.set(lower, { username: uname, primaryRole: m.role || '지사', orgs: [m.orgName] });
      } else {
        const item = userMap.get(lower)!;
        const priority: { [k: string]: number } = { 관리자: 10, 총무: 8, 본부: 6, 지사: 4, 본부모바일: 5, 지사모바일: 3, 영업사원: 2 };
        if ((priority[m.role] || 0) > (priority[item.primaryRole] || 0)) item.primaryRole = m.role;
        item.orgs.push(m.orgName);
      }
    });

    let count = 0;
    const currentLower = (currentUser?.username || '').trim().toLowerCase();

    userMap.forEach(acc => {
      if (acc.primaryRole === '관리자' || acc.primaryRole === '총무') return;
      if (currentLower && acc.username.toLowerCase() === currentLower) return;

      const isSalesPattern = /^a01[0-9]{8,9}$/i.test(acc.username) || acc.primaryRole === '영업사원';
      if (isSalesPattern) {
        let cleanPhone = acc.username.replace(/^[aA]/, '').replace(/[^0-9]/g, '');
        if (cleanPhone.length === 10 && cleanPhone.startsWith('10')) cleanPhone = '0' + cleanPhone;

        const existsPhone = phoneSet.has(cleanPhone);
        const existsCode = codeSet.has(acc.username.toUpperCase());

        if (!existsPhone && !existsCode) {
          count++;
        } else if (retiredPhoneSet.has(cleanPhone) || retiredCodeSet.has(acc.username.toUpperCase())) {
          count++;
        }
        return;
      }

      if (acc.primaryRole === '본부' || acc.primaryRole === '본부모바일') {
        const hasHq = acc.orgs.some(o => hqSet.has(o.trim())) || hqSet.has(acc.username);
        if (!hasHq) count++;
        return;
      }

      if (acc.primaryRole === '지사' || acc.primaryRole === '지사모바일') {
        const hasBranch = acc.orgs.some(o => branchSet.has(o.trim())) || branchSet.has(acc.username);
        if (!hasBranch) count++;
        return;
      }
    });

    return count;
  }, [empSheetRows, members, currentUser]);

  // 사원리스트 미존재 계정 일괄 삭제 처리
  const handleDeleteMissingAccounts = (usernamesToDelete: string[]) => {
    if (usernamesToDelete.length === 0) return;
    const lowerSet = new Set(usernamesToDelete.map(u => u.trim().toLowerCase()));
    setMembers(prev => prev.filter(m => !lowerSet.has(m.username.trim().toLowerCase())));
    setHasChanges(true);
    alert(`총 ${usernamesToDelete.length}개의 미존재/퇴사 계정이 삭제되었습니다.\n상단의 [시트에 최종 저장] 버튼을 눌러 구글 시트에 반영해 주세요.`);
  };

  // 자동 생성된 계정 목록 병합 및 미존재 계정 삭제 연동 처리
  const handleBatchGeneratedAccounts = (newAccounts: MemberAccount[], deletedUsernames?: string[]) => {
    setMembers(prev => {
      let list = prev;
      if (deletedUsernames && deletedUsernames.length > 0) {
        const delSet = new Set(deletedUsernames.map(u => u.trim().toLowerCase()));
        list = list.filter(m => !delSet.has(m.username.trim().toLowerCase()));
      }
      if (newAccounts.length > 0) {
        const existingKeySet = new Set(
          list.map(m => `${m.username.trim().toUpperCase()}|${m.role}|${m.orgName}`)
        );
        const trulyNew = newAccounts.filter(
          a => !existingKeySet.has(`${a.username.trim().toUpperCase()}|${a.role}|${a.orgName}`)
        );
        list = [...trulyNew, ...list];
      }
      return list;
    });

    setHasChanges(true);
    setSelectedRoleFilter('전체');
    setSearchTerm('');

    const addedMsg = newAccounts.length > 0 ? `${newAccounts.length}개 신규 계정 추가` : '';
    const deletedMsg = deletedUsernames && deletedUsernames.length > 0 ? `${deletedUsernames.length}개 사라진 계정 정리` : '';
    const resultMsg = [addedMsg, deletedMsg].filter(Boolean).join(', ');
    alert(`${resultMsg} 완료!\n상단 [시트에 최종 저장] 버튼을 눌러 구글 시트에 반영해 주세요.`);
  };

  useEffect(() => {
    if (isOpen) {
      setMembers(JSON.parse(JSON.stringify(initialMembers)));
      setHasChanges(false);
      setSearchTerm('');
      setSelectedRoleFilter('전체');
      setNewUsername('');
      setNewPassword('');
    }
  }, [isOpen, initialMembers]);

  // 본부 상태 맵 (운영 여부 확인용: isActive === false인 경우만 미운영, 그 외는 운영중)
  const hqStatusMap = useMemo(() => {
    const map = new Map<string, boolean>();
    (hqSettings || []).forEach(h => {
      if (h.hqName) {
        map.set(h.hqName.trim().toLowerCase(), h.isActive !== false);
      }
    });
    return map;
  }, [hqSettings]);

  // 특정 본부가 운영중인지 여부 판단
  const isHqActive = (hqName: string): boolean => {
    const norm = (hqName || '').trim().toLowerCase();
    if (hqStatusMap.has(norm)) {
      return hqStatusMap.get(norm)!;
    }
    return true; // 기본값은 운영중
  };

  // 등록된 모든 본부 목록 (사원리스트 52개 본부 최우선 반영 + 정산설정 + 계약데이터 + 기존 계정 소속)
  const cleanHqs = useMemo(() => {
    const set = new Set<string>();
    // 1. 사원리스트 시트의 52개 본부 최우선 반영
    empSheetHqs.forEach(h => { if (h && h.trim()) set.add(h.trim()); });
    // 2. hqSettings에 등록된 본부
    (hqSettings || []).forEach(h => { if (h.hqName && h.hqName.trim()) set.add(h.hqName.trim()); });
    // 3. availableHqs
    availableHqs.forEach(h => { if (h && h !== '전체' && h.trim()) set.add(h.trim()); });
    // 4. members에 이미 할당된 본부
    members.forEach(m => {
      if ((m.role === '본부' || m.role === '본부모바일') && m.orgName && m.orgName.trim()) {
        set.add(m.orgName.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko-KR'));
  }, [empSheetHqs, hqSettings, availableHqs, members]);

  // 지사 목록 정제 (사원리스트의 전체 지사 + availableBranches + members)
  const cleanBranches = useMemo(() => {
    const set = new Set<string>();
    (Object.values(empSheetHqToBranches) as string[][]).forEach(brs => {
      (brs || []).forEach(b => { if (b && b.trim()) set.add(b.trim()); });
    });
    availableBranches.forEach(b => {
      if (b && b !== '전체' && b.trim()) set.add(b.trim());
    });
    members.forEach(m => {
      if ((m.role === '지사' || m.role === '지사모바일' || m.role === '지점') && m.orgName && m.orgName.trim()) {
        set.add(m.orgName.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko-KR'));
  }, [empSheetHqToBranches, availableBranches, members]);

  // 운영중 / 미운영 본부 개수 통계
  const activeHqCount = useMemo(() => cleanHqs.filter(h => isHqActive(h)).length, [cleanHqs, hqStatusMap]);
  const inactiveHqCount = useMemo(() => cleanHqs.filter(h => !isHqActive(h)).length, [cleanHqs, hqStatusMap]);

  // 다중 할당 모달 내 본부 필터링 결과
  const filteredHqs = useMemo(() => {
    return cleanHqs.filter(h => {
      if (assignSearch && !h.toLowerCase().includes(assignSearch.toLowerCase())) {
        return false;
      }
      const active = isHqActive(h);
      if (assignHqStatusFilter === 'active' && !active) return false;
      if (assignHqStatusFilter === 'inactive' && active) return false;
      return true;
    });
  }, [cleanHqs, assignSearch, assignHqStatusFilter, hqStatusMap]);

  // 다중 할당 모달 대상 계정이 현재 할당받은 본부 목록
  const modalAssignedHqs = useMemo(() => {
    if (!assignModalAccount) return [];
    return members
      .filter(m => m.username.toLowerCase() === assignModalAccount.username.toLowerCase() && (m.role === '본부' || m.role === '본부모바일'))
      .map(m => m.orgName);
  }, [assignModalAccount, members]);

  // 특정 지사의 소속 본부명 찾기
  const getBranchHqName = (branchName: string): string => {
    for (const [hq, branches] of Object.entries(empSheetHqToBranches)) {
      if ((branches as string[]).includes(branchName)) return hq;
    }
    return '';
  };

  // 다중 할당 모달에서 표시할 지사 후보 목록 (선택한 본부의 해당 지사값만 표시)
  const candidateBranches = useMemo(() => {
    if (!assignModalAccount) return [];

    let targetHqs: string[] = [];
    if (branchHqScope === 'AUTO') {
      targetHqs = modalAssignedHqs;
    } else if (branchHqScope === 'ALL') {
      return cleanBranches;
    } else {
      targetHqs = [branchHqScope];
    }

    const branchSet = new Set<string>();
    targetHqs.forEach(hq => {
      const brs = empSheetHqToBranches[hq] || [];
      brs.forEach(b => branchSet.add(b));
    });

    // 이 계정에 이미 할당되어 있는 지사도 화면에 노출하여 체크 해제/확인이 가능하도록 포함
    const currentlyAssignedBranches = members
      .filter(m => m.username.toLowerCase() === assignModalAccount.username.toLowerCase() && (m.role === '지사' || m.role === '지사모바일' || m.role === '지점'))
      .map(m => m.orgName);
    currentlyAssignedBranches.forEach(b => branchSet.add(b));

    // 검색어 필터
    let list = Array.from(branchSet);
    if (assignSearch) {
      list = list.filter(b => b.toLowerCase().includes(assignSearch.toLowerCase()));
    }

    return list.sort((a, b) => a.localeCompare(b, 'ko-KR'));
  }, [assignModalAccount, branchHqScope, modalAssignedHqs, empSheetHqToBranches, cleanBranches, members, assignSearch]);

  // 아이디(username)별로 묶은 GroupedAccount 목록
  const groupedAccounts = useMemo(() => {
    const map = new Map<string, GroupedAccount>();

    members.forEach((m, idx) => {
      const uname = (m.username || '').trim();
      if (!uname) return;
      const lower = uname.toLowerCase();

      if (!map.has(lower)) {
        map.set(lower, {
          username: uname,
          password: m.password || '',
          primaryRole: m.role || '지사',
          orgEntries: [{ role: m.role, orgName: m.orgName }],
          originalIndices: [idx]
        });
      } else {
        const item = map.get(lower)!;
        // 비밀번호가 채워져 있다면 업데이트
        if (m.password && !item.password) item.password = m.password;
        // 대표 권한 승격 (관리자 > 총무 > 본부 > 지사)
        const priority: { [key: string]: number } = {
          관리자: 10, 총무: 8, 본부: 6, 지사: 4, 본부모바일: 5, 지사모바일: 3, 영업사원: 2
        };
        if ((priority[m.role] || 0) > (priority[item.primaryRole] || 0)) {
          item.primaryRole = m.role;
        }
        item.orgEntries.push({ role: m.role, orgName: m.orgName });
        item.originalIndices.push(idx);
      }
    });

    return Array.from(map.values());
  }, [members]);

  // 권한별 카운트 (통합 계정 기준)
  const roleCounts = useMemo(() => {
    const counts: { [key: string]: number } = { 전체: groupedAccounts.length };
    PRESET_ROLES.forEach(r => {
      counts[r.value] = groupedAccounts.filter(g => g.primaryRole === r.value).length;
    });
    const presetValues = PRESET_ROLES.map(r => r.value);
    counts['기타'] = groupedAccounts.filter(g => !presetValues.includes(g.primaryRole)).length;
    return counts;
  }, [groupedAccounts]);

  // 필터링된 통합 계정 목록
  const filteredGroupedAccounts = useMemo(() => {
    return groupedAccounts.filter(acc => {
      // 권한 필터
      if (selectedRoleFilter !== '전체') {
        if (selectedRoleFilter === '기타') {
          const presetValues = PRESET_ROLES.map(r => r.value);
          if (presetValues.includes(acc.primaryRole)) return false;
        } else if (acc.primaryRole !== selectedRoleFilter) {
          return false;
        }
      }
      // 검색어 필터
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const matchUser = acc.username.toLowerCase().includes(q);
        const matchRole = acc.primaryRole.toLowerCase().includes(q);
        const matchOrgs = acc.orgEntries.some(o => o.orgName.toLowerCase().includes(q) || o.role.toLowerCase().includes(q));
        if (!matchUser && !matchRole && !matchOrgs) return false;
      }
      return true;
    });
  }, [groupedAccounts, selectedRoleFilter, searchTerm]);

  // 검색어/권한 필터/페이지 크기 변경 시 1페이지로 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedRoleFilter, pageSize]);

  // 페이지네이션된 목록 슬라이스 (성능 극대화)
  const totalPages = Math.ceil(filteredGroupedAccounts.length / pageSize) || 1;
  const paginatedAccounts = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredGroupedAccounts.slice(startIndex, startIndex + pageSize);
  }, [filteredGroupedAccounts, currentPage, pageSize]);

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
    
    // 동일한 아이디 + 동일한 조직명이 이미 있는지만 확인 (다중 조직 추가 허용)
    const exactDuplicate = members.some(
      m => m.username.toLowerCase() === trimmedUsername.toLowerCase() && m.orgName.toLowerCase() === finalOrgName.toLowerCase()
    );
    if (exactDuplicate) {
      alert(`이미 동일한 아이디 [${trimmedUsername}]에 [${finalOrgName}]이(가) 등록되어 있습니다.`);
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
    alert(`계정 [${trimmedUsername}]에 [${finalOrgName}] (${newRole}) 권한이 추가되었습니다.\n최종 적용을 위해 상단의 [시트에 최종 저장] 버튼을 눌러주세요.`);
  };

  // 계정 전체 삭제 (해당 아이디의 모든 소속 행 삭제)
  const handleDeleteGroupedAccount = async (username: string) => {
    if (username === currentUser?.username) {
      alert('현재 로그인 중인 본인 계정은 삭제할 수 없습니다.');
      return;
    }
    if (await customConfirm(`정말 계정 [${username}]의 모든 소속 및 로그인 정보를 삭제하시겠습니까?`, '계정 삭제')) {
      const updated = members.filter(m => m.username.toLowerCase() !== username.toLowerCase());
      setMembers(updated);
      setHasChanges(true);
      if (assignModalAccount?.username.toLowerCase() === username.toLowerCase()) {
        setAssignModalAccount(null);
      }
    }
  };

  // 특정 조직 권한 1개만 제거
  const handleRemoveSingleOrg = async (username: string, orgName: string, role: string) => {
    const userRows = members.filter(m => m.username.toLowerCase() === username.toLowerCase());
    if (userRows.length <= 1) {
      if (!await customConfirm(`이 조직을 제거하면 계정 [${username}]의 소속이 0개가 됩니다.\n계정을 완전히 삭제하시겠습니까?`, '계정 삭제 확인')) {
        return;
      }
    }
    const updated = members.filter(m => 
      !(m.username.toLowerCase() === username.toLowerCase() && m.orgName === orgName && m.role === role)
    );
    setMembers(updated);
    setHasChanges(true);

    // 열려있는 다중 관리 모달 정보도 동기화
    if (assignModalAccount && assignModalAccount.username.toLowerCase() === username.toLowerCase()) {
      setAssignModalAccount({
        ...assignModalAccount,
        orgEntries: assignModalAccount.orgEntries.filter(o => !(o.orgName === orgName && o.role === role))
      });
    }
  };

  // 다중 조직 할당: 본부/지사 토글 (체크/해제)
  const handleToggleOrgAssignment = (targetAcc: GroupedAccount, targetOrgName: string, targetRole: string) => {
    const isAssigned = members.some(
      m => m.username.toLowerCase() === targetAcc.username.toLowerCase() &&
           m.orgName.toLowerCase() === targetOrgName.toLowerCase()
    );

    let updated: MemberAccount[];
    if (isAssigned) {
      // 제거
      const userRows = members.filter(m => m.username.toLowerCase() === targetAcc.username.toLowerCase());
      if (userRows.length <= 1) {
        alert('최소 1개 이상의 소속 본부 또는 지사가 지정되어 있어야 합니다.');
        return;
      }
      updated = members.filter(m => 
        !(m.username.toLowerCase() === targetAcc.username.toLowerCase() && m.orgName.toLowerCase() === targetOrgName.toLowerCase())
      );
    } else {
      // 추가
      const newRow: MemberAccount = {
        username: targetAcc.username,
        password: targetAcc.password || '1234',
        role: targetRole,
        orgName: targetOrgName
      };
      updated = [...members, newRow];
    }

    setMembers(updated);
    setHasChanges(true);

    // 열려있는 모달 상태 실시간 갱신
    const currentOrgs = updated
      .filter(m => m.username.toLowerCase() === targetAcc.username.toLowerCase())
      .map(m => ({ role: m.role, orgName: m.orgName }));

    setAssignModalAccount({
      ...targetAcc,
      orgEntries: currentOrgs
    });
  };

  // 계정 단일 행 수정 시작
  const startEditing = (idx: number) => {
    setEditingIndex(idx);
    setEditForm({ ...members[idx] });
    setShowEditPassword(false);
  };

  // 수정 적용
  const applyEdit = () => {
    if (editingIndex === null) return;
    if (!editForm.role.trim() || !editForm.orgName.trim() || !editForm.username.trim() || !editForm.password.trim()) {
      alert('모든 필수 항목을 입력해 주세요.');
      return;
    }

    const updated = [...members];
    const oldUsername = updated[editingIndex].username;
    const newUsername = editForm.username.trim();
    const newPassword = editForm.password.trim();

    // 비밀번호가 변경되었을 경우, 해당 계정의 모든 소속 행의 비밀번호도 일괄 동기화
    updated.forEach(m => {
      if (m.username.toLowerCase() === oldUsername.toLowerCase()) {
        m.username = newUsername;
        m.password = newPassword;
      }
    });

    updated[editingIndex] = {
      role: editForm.role.trim(),
      orgName: editForm.orgName.trim(),
      username: newUsername,
      password: newPassword
    };

    setMembers(updated);
    setHasChanges(true);
    setEditingIndex(null);
  };

  // 서버/시트에 최종 저장
  const handleSaveToSheet = async () => {
    if (members.length === 0) {
      if (!await customConfirm('현재 등록된 계정이 0개입니다.\n그대로 저장하면 모든 계정이 삭제됩니다. 진행하시겠습니까?', '전체 계정 삭제 경고')) {
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
      ['본부', '강남본부', 'multi_manager', '1234'],
      ['본부', '서초본부', 'multi_manager', '1234'],
      ['지사', '역삼지사', 'branch_leader', '1234'],
      ['지사', '선릉지사', 'branch_leader', '1234'],
      ['관리자', '본사/전체', 'admin02', 'admin1234!']
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
      ...members.map(m => {
        let pw = String(m.password || '');
        if (pw.length === 10 && /^1[0-9]{9}$/.test(pw) && (m.username?.startsWith('a01') || pw.startsWith('10'))) {
          pw = '0' + pw;
        }
        return [m.role, m.orgName, m.username, pw];
      })
    ];
    const ws = XLSX.utils.aoa_to_sheet(dataRows, { cellDates: false });
    // 모든 셀의 데이터 타입을 텍스트(string)로 명시하여 엑셀에서 앞자리 0이 유지되도록 처리
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:D1');
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell_ref = XLSX.utils.encode_cell({ c: C, r: R });
        if (ws[cell_ref]) {
          ws[cell_ref].t = 's';
          ws[cell_ref].z = '@';
        }
      }
    }
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
        const workbook = XLSX.read(data, { type: 'binary', raw: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

        if (!rows || rows.length <= 1) {
          alert('엑셀에 등록할 계정 데이터가 없습니다.');
          return;
        }

        const header = rows[0].map((h: any) => String(h || '').trim());
        let roleIdx = header.indexOf('구분');
        let orgIdx = header.indexOf('조직명');
        let userIdx = header.indexOf('아이디');
        let pwIdx = header.indexOf('비밀번호');

        if (roleIdx === -1) roleIdx = 0;
        if (orgIdx === -1) orgIdx = 1;
        if (userIdx === -1) userIdx = 2;
        if (pwIdx === -1) pwIdx = 3;

        const importedMembers: MemberAccount[] = [];
        let count = 0;

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const role = String(row[roleIdx] || '').trim();
          const orgName = String(row[orgIdx] || '').trim();
          let username = String(row[userIdx] || '').trim();
          let password = String(row[pwIdx] || '').trim();

          if (!username) continue;

          // 엑셀에서 숫자로 파싱되어 010... 번호의 앞자리 0이 누락된 경우 자동 복원
          if (password.length === 10 && /^1[0-9]{9}$/.test(password) && (username.startsWith('a01') || username.startsWith('01') || password.startsWith('10'))) {
            password = '0' + password;
          }
          if (username.length === 10 && /^1[0-9]{9}$/.test(username)) {
            username = '0' + username;
          }

          importedMembers.push({
            role: role || '지사',
            orgName: orgName || '미지정',
            username,
            password: password || '1234'
          });
          count++;
        }

        setMembers(importedMembers);
        setHasChanges(true);
        alert(`엑셀 파일에서 총 ${count}건의 조직 계정 레코드를 성공적으로 불러왔습니다.\n최종 적용을 위해 [시트에 최종 저장] 버튼을 눌러주세요.`);
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
        onClick={async () => {
          if (hasChanges) {
            if (await customConfirm('저장되지 않은 변경 사항이 있습니다.\n정말 닫으시겠습니까?', '저장되지 않은 변경사항')) {
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
        className="relative bg-slate-50 rounded-2xl shadow-2xl border border-slate-200 w-[98vw] max-w-[1580px] max-h-[94vh] flex flex-col overflow-hidden z-10"
      >
        {/* 모달 상단 헤더 */}
        <div className="px-6 py-3.5 bg-white border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0 shadow-2xs">
          <div className="flex items-center gap-3 shrink-0">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 shadow-2xs shrink-0">
              <UserCheck size={22} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black text-slate-900 tracking-tight whitespace-nowrap">ERP 조직 계정 관리</h2>
                <span className="text-xs font-bold px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full border border-blue-200 whitespace-nowrap">
                  {groupedAccounts.length}개 계정 ({members.length}개 소속 설정)
                </span>
                {hasChanges && (
                  <span className="text-xs font-bold px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded-full border border-amber-300 animate-pulse flex items-center gap-1 whitespace-nowrap">
                    <AlertTriangle size={12} /> 저장되지 않은 변경사항 있음
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                한 계정에서 여러 본부/지사를 통합 관리할 수 있으며, 구글 시트와 실시간 연동됩니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 whitespace-nowrap overflow-x-auto pb-1 md:pb-0">
            {/* 계정 자동 생성 마법사 버튼 */}
            <button
              onClick={() => setIsAutoGeneratorOpen(true)}
              className="px-3.5 py-2 text-xs font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs hover:scale-102 whitespace-nowrap shrink-0"
              title="사원리스트 시트 기반 본부/지사/사원 계정 일괄 생성 마법사"
            >
              <Sparkles size={14} className="text-indigo-600" />
              <span className="whitespace-nowrap">계정 자동생성</span>
            </button>

            {/* 사원리스트 미존재 계정 정리 버튼 */}
            <button
              onClick={() => setIsMissingCleanupOpen(true)}
              className="px-3.5 py-2 text-xs font-black text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs hover:scale-102 whitespace-nowrap shrink-0 relative"
              title="사원리스트 시트에 없는 계정 및 퇴사자 계정 일괄 정리"
            >
              <UserX size={14} className="text-rose-600 shrink-0" />
              <span className="whitespace-nowrap">미존재 계정 정리</span>
              {missingAccountCount > 0 && (
                <span className="px-1.5 py-0.5 bg-rose-600 text-white text-[10px] font-black rounded-full shadow-2xs animate-pulse leading-none">
                  {missingAccountCount}
                </span>
              )}
            </button>

            {/* 엑셀 관련 액션 버튼 */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0 whitespace-nowrap">
              <button
                onClick={handleDownloadTemplate}
                className="px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:text-blue-600 hover:bg-white rounded-lg transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                title="일괄 등록용 엑셀 양식 다운로드"
              >
                <Download size={13} className="shrink-0" />
                <span className="whitespace-nowrap">양식 받기</span>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:text-emerald-600 hover:bg-white rounded-lg transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                title="엑셀 파일로 대량 계정 일괄 등록/갱신"
              >
                <Upload size={13} className="shrink-0" />
                <span className="whitespace-nowrap">엑셀 일괄등록</span>
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
                className="px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-white rounded-lg transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                title="현재 계정 목록 엑셀 백업"
              >
                <FileSpreadsheet size={13} className="shrink-0" />
                <span className="whitespace-nowrap">백업 다운로드</span>
              </button>
            </div>

            {/* 시트 저장 버튼 */}
            <button
              onClick={handleSaveToSheet}
              disabled={isSaving}
              className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                hasChanges 
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200 scale-102 ring-2 ring-emerald-400' 
                  : 'bg-slate-800 hover:bg-slate-900 text-white'
              }`}
            >
              {isSaving ? <RefreshCw size={14} className="animate-spin shrink-0" /> : <CheckCircle size={14} className="shrink-0" />}
              <span className="whitespace-nowrap">{isSaving ? '시트 저장 중...' : '시트에 최종 저장'}</span>
            </button>

            {/* 닫기 버튼 */}
            <button
              onClick={async () => {
                if (hasChanges && !await customConfirm('저장되지 않은 변경 사항이 있습니다.\n정말 닫으시겠습니까?', '저장되지 않은 변경사항')) return;
                onClose();
              }}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer shrink-0 ml-1"
            >
              <X size={20} />
            </button>
          </div>
        </div>


        {/* 바디 컨텐츠 영역 (스크롤) */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          
          {/* 1. 신규 계정/조직 간편 등록 카드 */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                  <Plus size={16} />
                </span>
                <h3 className="text-sm font-black text-slate-800">신규 계정 / 권한 추가</h3>
                <span className="text-[11px] text-slate-400 font-medium">
                  기존에 있는 아이디를 입력하면 해당 계정에 새로운 본부/지사 관리 권한이 추가(복수 소속)됩니다.
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
                    {cleanHqs.map(hq => {
                      const active = isHqActive(hq);
                      return (
                        <option key={hq} value={hq}>
                          {hq} {active ? '(운영)' : '(미운영)'}
                        </option>
                      );
                    })}
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
                    name="erp_new_account_id"
                    autoComplete="off"
                    placeholder="아이디 입력"
                    value={newUsername}
                    onChange={(e) => {
                      const u = e.target.value.trim();
                      setNewUsername(u);
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none placeholder:font-normal placeholder:text-slate-400"
                  />
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
                    name="erp_new_account_pwd_field"
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
                    spellCheck={false}
                    placeholder="비밀번호 입력"
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
                  계정/권한 등록
                </button>
              </div>
            </div>
          </div>

          {/* 2. 계정 목록 및 다중 조직 설정 뷰 */}
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
                  placeholder="아이디, 소속 조직명 검색..."
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

            {/* 계정 목록 테이블 (통합 뷰) */}
            <div className="overflow-x-auto max-h-[460px] custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100/80 text-slate-600 font-black sticky top-0 z-10 border-b border-slate-200 select-none">
                  <tr>
                    <th className="px-4 py-3 text-center w-12 whitespace-nowrap">No</th>
                    <th className="px-4 py-3 text-center min-w-[120px] whitespace-nowrap">대표 권한</th>
                    <th className="px-4 py-3 min-w-[160px] whitespace-nowrap">로그인 아이디</th>
                    <th className="px-4 py-3 min-w-[170px] whitespace-nowrap">비밀번호</th>
                    <th className="px-4 py-3 min-w-[320px]">관리 권한 (소속 본부 / 지사 목록)</th>
                    <th className="px-4 py-3 text-center w-48 min-w-[180px] whitespace-nowrap">관리 및 권한 설정</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredGroupedAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-16 text-center text-slate-400 font-bold bg-slate-50/30">
                        {searchTerm ? '검색 결과와 일치하는 계정이 없습니다.' : '등록된 계정이 없습니다.'}
                      </td>
                    </tr>
                  ) : (
                    paginatedAccounts.map((acc, seq) => {
                      const isPwdVisible = !!visiblePasswords[acc.username];
                      const isCurrentUser = acc.username === currentUser?.username;
                      const hasMultiple = acc.orgEntries.length > 1;
                      const rowNumber = (currentPage - 1) * pageSize + seq + 1;

                      return (
                        <tr 
                          key={acc.username}
                          className={`hover:bg-slate-50/80 transition-colors ${isCurrentUser ? 'bg-blue-50/40' : ''}`}
                        >
                          {/* 번호 */}
                          <td className="px-4 py-3 text-center text-slate-400 font-mono text-[11px] whitespace-nowrap">
                            {rowNumber}
                          </td>

                          {/* 대표 권한 뱃지 */}
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <span className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-black whitespace-nowrap shrink-0 ${
                              acc.primaryRole.includes('관리자') ? 'bg-rose-100 text-rose-700 border border-rose-200' :
                              acc.primaryRole.includes('총무') ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                              acc.primaryRole.includes('본부') ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                              acc.primaryRole.includes('지사') ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                              acc.primaryRole.includes('영업사원') ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                              'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}>
                              {acc.primaryRole}
                            </span>
                          </td>

                          {/* 아이디 */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <User size={13} className="text-blue-500 shrink-0" />
                              <span className="font-mono font-black text-blue-600 text-sm whitespace-nowrap">{acc.username}</span>
                              {isCurrentUser && (
                                <span className="text-[10px] bg-blue-600 text-white font-bold px-1.5 py-0.2 rounded-full whitespace-nowrap shrink-0">
                                  내 계정
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 비밀번호 */}
                          <td className="px-4 py-3 whitespace-nowrap min-w-[170px]">
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <span className="font-mono text-slate-700 font-bold bg-slate-100 px-3 py-1 rounded border border-slate-200 min-w-[110px] text-center text-xs tracking-wider">
                                {isPwdVisible ? acc.password : '••••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setVisiblePasswords(prev => ({
                                    ...prev,
                                    [acc.username]: !prev[acc.username]
                                  }));
                                }}
                                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 cursor-pointer shrink-0"
                                title={isPwdVisible ? '비밀번호 가리기' : '비밀번호 확인'}
                              >
                                {isPwdVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            </div>
                          </td>

                          {/* 관리 권한 (소속 본부/지사 뱃지들) */}
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {acc.orgEntries.map((entry, eIdx) => (
                                <span
                                  key={`${entry.role}-${entry.orgName}-${eIdx}`}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg shadow-2xs text-xs font-bold text-slate-700 group hover:border-slate-300 whitespace-nowrap shrink-0"
                                >
                                  <Building2 size={11} className="text-slate-400 shrink-0" />
                                  <span className="text-[10px] text-blue-600 font-black whitespace-nowrap shrink-0">[{entry.role}]</span>
                                  <span className="whitespace-nowrap">{entry.orgName}</span>
                                  {acc.orgEntries.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveSingleOrg(acc.username, entry.orgName, entry.role);
                                      }}
                                      className="text-slate-300 hover:text-rose-500 rounded p-0.5 ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                      title="이 조직 권한 제거"
                                    >
                                      <X size={11} />
                                    </button>
                                  )}
                                </span>
                              ))}

                              {/* 다중 권한 추가 버튼 */}
                              <button
                                type="button"
                                onClick={() => {
                                  setAssignModalAccount(acc);
                                  setAssignSearch('');
                                  setAssignHqStatusFilter('all');
                                  setBranchHqScope('AUTO');
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.8 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-black transition-all cursor-pointer shadow-2xs"
                                title="본부/지사 권한 추가 및 제거"
                              >
                                <Plus size={11} />
                                권한 추가/설정
                              </button>
                            </div>
                          </td>

                          {/* 관리 액션 */}
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                              {/* 다중 권한 설정 버튼 */}
                              <button
                                onClick={() => {
                                  setAssignModalAccount(acc);
                                  setAssignSearch('');
                                  setAssignHqStatusFilter('all');
                                  setBranchHqScope('AUTO');
                                }}
                                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold shadow-2xs flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap shrink-0"
                                title="본부/지사 다중 권한 설정"
                              >
                                <Layers size={12} className="shrink-0" />
                                <span className="whitespace-nowrap">다중설정</span>
                              </button>

                              {/* 비밀번호/아이디 수정 */}
                              <button
                                onClick={() => startEditing(acc.originalIndices[0])}
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all cursor-pointer shrink-0"
                                title="계정 비밀번호 및 기본정보 수정"
                              >
                                <Edit3 size={14} />
                              </button>

                              {/* 계정 전체 삭제 */}
                              <button
                                onClick={() => handleDeleteGroupedAccount(acc.username)}
                                disabled={isCurrentUser}
                                className={`p-1.5 rounded-lg transition-all cursor-pointer shrink-0 ${
                                  isCurrentUser 
                                    ? 'text-slate-300 cursor-not-allowed' 
                                    : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                                }`}
                                title={isCurrentUser ? '현재 로그인된 계정은 삭제할 수 없습니다.' : '계정 완전 삭제'}
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

            {/* 페이지네이션 및 통계 바 (대규모 계정 최적화) */}
            <div className="px-4 py-3 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-500 font-medium">
                <span>
                  전체 <b>{filteredGroupedAccounts.length.toLocaleString()}</b>개 계정 중{' '}
                  <b className="text-slate-800">{filteredGroupedAccounts.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</b> -{' '}
                  <b className="text-slate-800">{Math.min(currentPage * pageSize, filteredGroupedAccounts.length)}</b>번째 표시
                </span>
                <span className="text-slate-300">|</span>
                <span className="font-bold text-indigo-600">
                  {currentPage} / {totalPages} 페이지
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-slate-100 rounded-lg font-black text-slate-700 transition-all cursor-pointer disabled:cursor-not-allowed"
                  title="첫 페이지"
                >
                  &laquo;
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-slate-100 rounded-lg font-bold text-slate-700 transition-all cursor-pointer disabled:cursor-not-allowed"
                  title="이전 페이지"
                >
                  이전
                </button>

                {/* 페이지 번호 버튼 목록 */}
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(page => {
                      if (totalPages <= 7) return true;
                      return Math.abs(page - currentPage) <= 2 || page === 1 || page === totalPages;
                    })
                    .map((page, idx, arr) => {
                      const prevPage = arr[idx - 1];
                      const hasGap = prevPage && page - prevPage > 1;
                      return (
                        <React.Fragment key={page}>
                          {hasGap && <span className="px-1 text-slate-400 font-mono">...</span>}
                          <button
                            type="button"
                            onClick={() => setCurrentPage(page)}
                            className={`min-w-[28px] h-7 px-2 rounded-lg font-black transition-all cursor-pointer text-xs ${
                              currentPage === page
                                ? 'bg-indigo-600 text-white shadow-2xs'
                                : 'bg-slate-50 text-slate-600 hover:bg-slate-200 border border-slate-200'
                            }`}
                          >
                            {page}
                          </button>
                        </React.Fragment>
                      );
                    })}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-slate-100 rounded-lg font-bold text-slate-700 transition-all cursor-pointer disabled:cursor-not-allowed"
                  title="다음 페이지"
                >
                  다음
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-slate-100 rounded-lg font-black text-slate-700 transition-all cursor-pointer disabled:cursor-not-allowed"
                  title="마지막 페이지"
                >
                  &raquo;
                </button>

                {/* 페이지당 표시 개수 */}
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="ml-2 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg font-black text-slate-700 text-xs outline-none cursor-pointer"
                >
                  <option value={30}>30개씩</option>
                  <option value={50}>50개씩</option>
                  <option value={100}>100개씩</option>
                  <option value={200}>200개씩</option>
                </select>
              </div>
            </div>

            {/* 테이블 하단 푸터 안내 */}
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
              <div>
                총 계정: <span className="font-bold text-slate-800">{filteredGroupedAccounts.length}</span>개 (시트 행 수: {members.length}건)
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span>💡 [다중설정] 버튼을 클릭하면 체크박스로 여러 본부/지사를 한 번에 설정할 수 있습니다.</span>
              </div>
            </div>

          </div>

        </div>

      </motion.div>

      {/* 다중 본부/지사 할당 전용 팝업 모달 */}
      <AnimatePresence>
        {assignModalAccount && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAssignModalAccount(null)}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-2xs"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-[96vw] max-w-5xl max-h-[92vh] flex flex-col overflow-hidden z-10"
            >
              {/* 모달 헤더 */}
              <div className="px-6 py-4 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs">
                    <Layers size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <span>[{assignModalAccount.username}]</span>
                      <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md font-bold">
                        다중 본부 / 지사 권한 관리
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      이 계정으로 로그인 시 조회 및 관리할 본부와 지사를 체크해 주세요.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setAssignModalAccount(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-xl transition-all cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* 검색 및 필터 */}
              <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    type="text"
                    placeholder="본부명 또는 지사명 검색..."
                    value={assignSearch}
                    onChange={(e) => setAssignSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              {/* 본부 및 지사 선택 영역 (체크박스 그리드) */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
                
                {/* 1. 본부 목록 */}
                <div>
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                        <Building2 size={15} className="text-blue-600" />
                        본부 권한 선택
                      </h4>
                      {/* 운영 / 미운영 구분 필터 탭 */}
                      <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() => setAssignHqStatusFilter('all')}
                          className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                            assignHqStatusFilter === 'all'
                              ? 'bg-white text-slate-900 shadow-2xs font-black'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          전체 ({cleanHqs.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setAssignHqStatusFilter('active')}
                          className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                            assignHqStatusFilter === 'active'
                              ? 'bg-emerald-600 text-white shadow-2xs font-black'
                              : 'text-emerald-700 hover:text-emerald-900'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          운영중 ({activeHqCount})
                        </button>
                        <button
                          type="button"
                          onClick={() => setAssignHqStatusFilter('inactive')}
                          className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                            assignHqStatusFilter === 'inactive'
                              ? 'bg-rose-500 text-white shadow-2xs font-black'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                          미운영 ({inactiveHqCount})
                        </button>
                      </div>
                    </div>

                    <span className="text-[11px] text-slate-500 font-medium">
                      💡 본부 선택 시 <b>해당 본부 전체 및 산하 지사</b> 데이터가 자동 조회됩니다.
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[260px] overflow-y-auto custom-scrollbar p-1">
                    {filteredHqs.map(hq => {
                      const isChecked = members.some(
                        m => m.username.toLowerCase() === assignModalAccount.username.toLowerCase() &&
                             m.orgName.toLowerCase() === hq.toLowerCase()
                      );
                      const active = isHqActive(hq);
                      const branchCount = (empSheetHqToBranches[hq] || []).length;

                      return (
                        <div
                          key={hq}
                          onClick={() => handleToggleOrgAssignment(assignModalAccount, hq, '본부')}
                          className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer select-none ${
                            isChecked
                              ? 'bg-blue-50 border-blue-400 text-blue-900 shadow-2xs ring-1 ring-blue-300'
                              : active
                                ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                                : 'bg-slate-50/70 border-slate-200 text-slate-500 hover:bg-slate-100/80'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate mr-1.5">
                            <span className="truncate">{hq}</span>
                            {active ? (
                              <span className="shrink-0 text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200">
                                운영중
                              </span>
                            ) : (
                              <span className="shrink-0 text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-rose-50 text-rose-500 border border-rose-200">
                                미운영
                              </span>
                            )}
                            {branchCount > 0 && (
                              <span className="shrink-0 text-[9px] text-slate-400 font-normal">
                                {branchCount}지사
                              </span>
                            )}
                          </div>
                          <div className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                            isChecked ? 'bg-blue-600 text-white' : 'border border-slate-300 bg-white'
                          }`}>
                            {isChecked && <Check size={11} strokeWidth={3} />}
                          </div>
                        </div>
                      );
                    })}

                    {filteredHqs.length === 0 && (
                      <div className="col-span-full py-8 text-center text-xs text-slate-400 font-bold bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        선택한 조건에 일치하는 본부가 없습니다.
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. 지사 목록 (선택한 본부의 해당 지사값만 표시) */}
                <div>
                  <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-100 flex-wrap gap-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                        <Building2 size={15} className="text-emerald-600" />
                        지사 권한 선택 ({candidateBranches.length}개)
                      </h4>

                      {/* 본부 선택 필터 컨트롤 */}
                      <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() => setBranchHqScope('AUTO')}
                          className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                            branchHqScope === 'AUTO'
                              ? 'bg-emerald-600 text-white shadow-2xs font-black'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          선택된 본부 지사 ({modalAssignedHqs.length > 0 ? `${modalAssignedHqs.length}개 본부` : '미선택'})
                        </button>
                        <button
                          type="button"
                          onClick={() => setBranchHqScope('ALL')}
                          className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                            branchHqScope === 'ALL'
                              ? 'bg-slate-800 text-white shadow-2xs font-black'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          전체 지사 보기
                        </button>
                      </div>

                      {/* 특정 본부 직접 지정 드롭다운 */}
                      <div className="flex items-center gap-1">
                        <select
                          value={branchHqScope !== 'AUTO' && branchHqScope !== 'ALL' ? branchHqScope : ''}
                          onChange={(e) => {
                            if (e.target.value) setBranchHqScope(e.target.value);
                          }}
                          className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-emerald-400 cursor-pointer"
                        >
                          <option value="">본부 직접 지정 ({cleanHqs.length}개)...</option>
                          {cleanHqs.map(hq => {
                            const count = (empSheetHqToBranches[hq] || []).length;
                            return (
                              <option key={hq} value={hq}>
                                {hq} {count > 0 ? `(${count}개 지사)` : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>

                    <span className="text-[11px] text-slate-500 font-medium">
                      {branchHqScope === 'ALL'
                        ? '전체 지사가 표시 중입니다.'
                        : branchHqScope !== 'AUTO'
                          ? `📌 [${branchHqScope}] 소속 지사만 표시 중입니다.`
                          : modalAssignedHqs.length > 0
                            ? `📌 [${modalAssignedHqs.join(', ')}] 산하 지사만 표시 중입니다.`
                            : '💡 상단에서 본부를 선택하거나, 위 드롭다운에서 본부를 지정하시면 해당 지사만 표시됩니다.'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[260px] overflow-y-auto custom-scrollbar p-1">
                    {candidateBranches.map(branch => {
                      const isChecked = members.some(
                        m => m.username.toLowerCase() === assignModalAccount.username.toLowerCase() &&
                             m.orgName.toLowerCase() === branch.toLowerCase()
                      );
                      const parentHq = getBranchHqName(branch);

                      return (
                        <div
                          key={branch}
                          onClick={() => handleToggleOrgAssignment(assignModalAccount, branch, '지사')}
                          className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer select-none ${
                            isChecked
                              ? 'bg-emerald-50 border-emerald-400 text-emerald-900 shadow-2xs ring-1 ring-emerald-300'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex flex-col min-w-0 mr-1.5">
                            <span className="truncate">{branch}</span>
                            {parentHq && (
                              <span className="text-[10px] text-slate-400 font-semibold truncate">
                                소속: {parentHq}
                              </span>
                            )}
                          </div>
                          <div className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                            isChecked ? 'bg-emerald-600 text-white' : 'border border-slate-300 bg-white'
                          }`}>
                            {isChecked && <Check size={11} strokeWidth={3} />}
                          </div>
                        </div>
                      );
                    })}

                    {candidateBranches.length === 0 && (
                      <div className="col-span-full py-8 text-center text-xs text-slate-400 font-bold bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        {modalAssignedHqs.length === 0 && branchHqScope === 'AUTO'
                          ? '상단 본부 권한을 체크하시거나, 위 드롭다운에서 본부를 선택하시면 해당 본부의 지사가 표시됩니다.'
                          : '조건에 일치하는 지사가 없습니다.'}
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* 모달 푸터 */}
              <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                <div className="text-xs text-slate-500">
                  현재 할당된 조직: <span className="font-bold text-indigo-700">{assignModalAccount.orgEntries.length}</span>개
                </div>
                <button
                  type="button"
                  onClick={() => setAssignModalAccount(null)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs shadow-sm transition-all cursor-pointer"
                >
                  선택 완료 및 닫기
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 계정 단일 수정 서브 모달 */}
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
                  계정 정보 및 비밀번호 수정
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

      {/* 사원리스트 기반 계정 자동생성 모달 */}
      <AnimatePresence>
        {isAutoGeneratorOpen && (
          <AutoAccountGeneratorModal
            isOpen={isAutoGeneratorOpen}
            onClose={() => setIsAutoGeneratorOpen(false)}
            onGenerate={handleBatchGeneratedAccounts}
            existingAccounts={members}
          />
        )}
      </AnimatePresence>

      {/* 사원리스트 미존재 계정 일괄 정리 모달 */}
      <AnimatePresence>
        {isMissingCleanupOpen && (
          <MissingAccountCleanupModal
            isOpen={isMissingCleanupOpen}
            onClose={() => setIsMissingCleanupOpen(false)}
            members={members}
            empRows={empSheetRows}
            onDeleteAccounts={handleDeleteMissingAccounts}
            currentUser={currentUser}
            onRefreshEmpList={fetchEmpSheet}
            isRefreshing={isRefreshingEmpSheet}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

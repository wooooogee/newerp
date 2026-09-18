import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Search,
  CheckSquare,
  Square,
  ShieldAlert,
  UserX,
  Building2,
  Users,
  CheckCircle2,
  Filter
} from 'lucide-react';
import { MemberAccount } from './AccountManagementModal';
import { customConfirm } from './CustomDialog';

export interface EmpRowData {
  no: string;
  code: string;
  hq: string;
  branch: string;
  branchOffice: string;
  name: string;
  resNo: string;
  position: string;
  status: string;
  empType: string;
  phone: string;
}

export interface MissingAccountItem {
  username: string;
  primaryRole: string;
  orgEntries: { role: string; orgName: string }[];
  reasonType: 'emp_missing' | 'emp_retired' | 'branch_missing' | 'hq_missing' | 'other_missing';
  reasonLabel: string;
  reasonDesc: string;
  empName?: string;
  empCode?: string;
  empStatus?: string;
}

interface MissingAccountCleanupModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: MemberAccount[];
  empRows: EmpRowData[];
  onDeleteAccounts: (usernamesToDelete: string[]) => void;
  currentUser: { username: string; role: string; orgName: string } | null;
  onRefreshEmpList?: () => Promise<void>;
  isRefreshing?: boolean;
}

export function MissingAccountCleanupModal({
  isOpen,
  onClose,
  members,
  empRows,
  onDeleteAccounts,
  currentUser,
  onRefreshEmpList,
  isRefreshing = false
}: MissingAccountCleanupModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTab, setSelectedTab] = useState<'all' | 'emp_missing' | 'emp_retired' | 'org_missing'>('all');
  const [selectedUsernames, setSelectedUsernames] = useState<Set<string>>(new Set());

  // 1. 사원리스트 룩업 맵 및 집합 구축
  const { phoneToEmpMap, codeToEmpMap, hqSet, branchSet } = useMemo(() => {
    const phoneMap = new Map<string, EmpRowData>();
    const codeMap = new Map<string, EmpRowData>();
    const hqs = new Set<string>();
    const branches = new Set<string>();

    empRows.forEach(emp => {
      if (emp.hq && emp.hq !== '-') {
        hqs.add(emp.hq.trim());
      }
      if (emp.branch && emp.branch !== '-') {
        branches.add(emp.branch.trim());
      }
      if (emp.code) {
        codeMap.set(emp.code.trim().toUpperCase(), emp);
      }

      let cleanPhone = emp.phone.replace(/[^0-9]/g, '');
      if (cleanPhone.length === 10 && cleanPhone.startsWith('10')) {
        cleanPhone = '0' + cleanPhone;
      }
      if (cleanPhone.length >= 10 && cleanPhone.startsWith('01')) {
        phoneMap.set(cleanPhone, emp);
      }
    });

    return {
      phoneToEmpMap: phoneMap,
      codeToEmpMap: codeMap,
      hqSet: hqs,
      branchSet: branches
    };
  }, [empRows]);

  // 2. members를 username 단위로 통합 후 미존재 계정 판별
  const missingAccountsList = useMemo(() => {
    // username별 통합
    const accountMap = new Map<string, { username: string; primaryRole: string; orgEntries: { role: string; orgName: string }[] }>();
    
    members.forEach(m => {
      const uname = (m.username || '').trim();
      if (!uname) return;
      const lower = uname.toLowerCase();

      if (!accountMap.has(lower)) {
        accountMap.set(lower, {
          username: uname,
          primaryRole: m.role || '지사',
          orgEntries: [{ role: m.role, orgName: m.orgName }]
        });
      } else {
        const item = accountMap.get(lower)!;
        const priority: { [key: string]: number } = {
          관리자: 10, 총무: 8, 본부: 6, 지사: 4, 본부모바일: 5, 지사모바일: 3, 영업사원: 2
        };
        if ((priority[m.role] || 0) > (priority[item.primaryRole] || 0)) {
          item.primaryRole = m.role;
        }
        item.orgEntries.push({ role: m.role, orgName: m.orgName });
      }
    });

    const missingList: MissingAccountItem[] = [];

    accountMap.forEach(acc => {
      const uname = acc.username.trim();
      const lowerUname = uname.toLowerCase();
      const currentLower = (currentUser?.username || '').trim().toLowerCase();

      // [보호 정책 1] 최고 관리자, 총무 계정은 절대 삭제 대상에 포함하지 않음
      if (acc.primaryRole === '관리자' || acc.primaryRole === '총무') {
        return;
      }
      // [보호 정책 2] 현재 로그인한 사용자 본인 계정 보호
      if (currentLower && lowerUname === currentLower) {
        return;
      }

      // 판별 A: 영업사원 계정 판별 (role이 영업사원이거나 아이디가 a010... 형식)
      const isSalesPattern = /^a01[0-9]{8,9}$/i.test(uname) || acc.primaryRole === '영업사원';

      if (isSalesPattern) {
        let cleanPhone = uname.replace(/^[aA]/, '').replace(/[^0-9]/g, '');
        if (cleanPhone.length === 10 && cleanPhone.startsWith('10')) {
          cleanPhone = '0' + cleanPhone;
        }

        const empByPhone = phoneToEmpMap.get(cleanPhone);
        const empByCode = codeToEmpMap.get(uname.toUpperCase());
        const emp = empByPhone || empByCode;

        if (!emp) {
          // 사원리스트에 해당 전화번호/사원코드를 가진 사원이 아예 없음 (시트에서 행 삭제됨)
          missingList.push({
            username: acc.username,
            primaryRole: acc.primaryRole,
            orgEntries: acc.orgEntries,
            reasonType: 'emp_missing',
            reasonLabel: '사원정보 삭제됨',
            reasonDesc: '사원리스트 시트에 일치하는 전화번호/사원코드가 없습니다.',
          });
          return;
        }

        // 사원리스트에는 있으나 상태가 퇴사/해촉인 경우
        const statusClean = (emp.status || '').trim();
        if (statusClean.includes('퇴사') || statusClean.includes('해촉') || statusClean.includes('중지')) {
          missingList.push({
            username: acc.username,
            primaryRole: acc.primaryRole,
            orgEntries: acc.orgEntries,
            reasonType: 'emp_retired',
            reasonLabel: `퇴사/해촉 (${statusClean})`,
            reasonDesc: `사원리스트 상태: [${statusClean}] 처리된 사원입니다.`,
            empName: emp.name,
            empCode: emp.code,
            empStatus: statusClean
          });
          return;
        }

        // 정상 재직 사원이면 패스
        return;
      }

      // 판별 B: 본부 계정 판별
      if (acc.primaryRole === '본부' || acc.primaryRole === '본부모바일') {
        const hasValidHq = acc.orgEntries.some(o => hqSet.has(o.orgName.trim())) || hqSet.has(uname);
        if (!hasValidHq) {
          missingList.push({
            username: acc.username,
            primaryRole: acc.primaryRole,
            orgEntries: acc.orgEntries,
            reasonType: 'hq_missing',
            reasonLabel: '미등록 본부',
            reasonDesc: `사원리스트 시트 본부 목록에 [${acc.orgEntries.map(o => o.orgName).join(', ')}]이(가) 없습니다.`
          });
          return;
        }
        return;
      }

      // 판별 C: 지사 계정 판별
      if (acc.primaryRole === '지사' || acc.primaryRole === '지사모바일') {
        const hasValidBranch = acc.orgEntries.some(o => branchSet.has(o.orgName.trim())) || branchSet.has(uname);
        if (!hasValidBranch) {
          missingList.push({
            username: acc.username,
            primaryRole: acc.primaryRole,
            orgEntries: acc.orgEntries,
            reasonType: 'branch_missing',
            reasonLabel: '미등록 지사',
            reasonDesc: `사원리스트 시트 지사 목록에 [${acc.orgEntries.map(o => o.orgName).join(', ')}]이(가) 없습니다.`
          });
          return;
        }
        return;
      }
    });

    return missingList;
  }, [members, phoneToEmpMap, codeToEmpMap, hqSet, branchSet, currentUser]);

  // 통계 계산
  const stats = useMemo(() => {
    let empMissingCount = 0;
    let empRetiredCount = 0;
    let orgMissingCount = 0;

    missingAccountsList.forEach(item => {
      if (item.reasonType === 'emp_missing') empMissingCount++;
      else if (item.reasonType === 'emp_retired') empRetiredCount++;
      else if (item.reasonType === 'hq_missing' || item.reasonType === 'branch_missing') orgMissingCount++;
    });

    return {
      total: missingAccountsList.length,
      empMissing: empMissingCount,
      empRetired: empRetiredCount,
      orgMissing: orgMissingCount
    };
  }, [missingAccountsList]);

  // 탭 및 검색어 필터링
  const filteredList = useMemo(() => {
    return missingAccountsList.filter(item => {
      // 탭 필터
      if (selectedTab === 'emp_missing' && item.reasonType !== 'emp_missing') return false;
      if (selectedTab === 'emp_retired' && item.reasonType !== 'emp_retired') return false;
      if (selectedTab === 'org_missing' && !(item.reasonType === 'hq_missing' || item.reasonType === 'branch_missing')) return false;

      // 검색어 필터
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const matchUname = item.username.toLowerCase().includes(q);
        const matchRole = item.primaryRole.toLowerCase().includes(q);
        const matchOrg = item.orgEntries.some(o => o.orgName.toLowerCase().includes(q));
        const matchName = (item.empName || '').toLowerCase().includes(q);
        const matchReason = item.reasonDesc.toLowerCase().includes(q);
        if (!matchUname && !matchRole && !matchOrg && !matchName && !matchReason) return false;
      }

      return true;
    });
  }, [missingAccountsList, selectedTab, searchTerm]);

  // 필터링된 항목 전체 선택 / 해제
  const handleToggleSelectAll = () => {
    if (selectedUsernames.size === filteredList.length && filteredList.length > 0) {
      setSelectedUsernames(new Set());
    } else {
      setSelectedUsernames(new Set(filteredList.map(i => i.username)));
    }
  };

  // 개별 항목 토글
  const handleToggleItem = (username: string) => {
    const next = new Set(selectedUsernames);
    if (next.has(username)) {
      next.delete(username);
    } else {
      next.add(username);
    }
    setSelectedUsernames(next);
  };

  // 일괄 삭제 실행
  const handleExecuteDelete = async () => {
    if (selectedUsernames.size === 0) {
      alert('삭제할 계정을 1개 이상 선택해 주세요.');
      return;
    }

    const count = selectedUsernames.size;
    const confirmMsg = `선택하신 ${count}개의 계정을 계정관리 목록에서 완전히 삭제하시겠습니까?\n\n※ 삭제 후 상단의 [시트에 최종 저장] 버튼을 눌러야 구글 시트에 최종 반영됩니다.`;

    if (!await customConfirm(confirmMsg, '사원리스트 미존재 계정 일괄 삭제')) {
      return;
    }

    onDeleteAccounts(Array.from(selectedUsernames));
    setSelectedUsernames(new Set());
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden">
      {/* 딤 배경 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
      />

      {/* 모달 본체 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-[96vw] max-w-[1240px] h-[92vh] max-h-[92vh] flex flex-col overflow-hidden z-10"
      >
        {/* 상단 헤더 */}
        <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 shadow-2xs">
              <UserX size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900 tracking-tight">사원리스트 미존재 계정 일괄 정리</h2>
                <span className="text-xs px-2.5 py-0.5 bg-rose-100 text-rose-800 rounded-full font-black border border-rose-200">
                  {stats.total}건 감지됨
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                구글 시트 [사원리스트]와 실시간 대조하여, 시트에서 사라졌거나 퇴사/해촉 처리된 불필요한 계정을 선별하여 일괄 정리합니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onRefreshEmpList && (
              <button
                type="button"
                onClick={onRefreshEmpList}
                disabled={isRefreshing}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="사원리스트 시트 실시간 재조회"
              >
                <RefreshCw size={13} className={isRefreshing ? 'animate-spin text-indigo-600' : ''} />
                <span className="hidden sm:inline">시트 새로고침</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 상단 통계 카드 & 필터 바 */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 shrink-0 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              onClick={() => setSelectedTab('all')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                selectedTab === 'all'
                  ? 'bg-white border-rose-300 shadow-sm ring-2 ring-rose-200'
                  : 'bg-white/70 border-slate-200 hover:bg-white'
              }`}
            >
              <div className="text-[11px] font-bold text-slate-500">전체 정리 대상</div>
              <div className="text-lg font-black text-slate-800 mt-0.5">{stats.total}개</div>
            </button>

            <button
              onClick={() => setSelectedTab('emp_missing')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                selectedTab === 'emp_missing'
                  ? 'bg-white border-rose-300 shadow-sm ring-2 ring-rose-200'
                  : 'bg-white/70 border-slate-200 hover:bg-white'
              }`}
            >
              <div className="text-[11px] font-bold text-rose-600 flex items-center gap-1">
                <span>🔴 사원정보 삭제됨</span>
              </div>
              <div className="text-lg font-black text-rose-700 mt-0.5">{stats.empMissing}개</div>
            </button>

            <button
              onClick={() => setSelectedTab('emp_retired')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                selectedTab === 'emp_retired'
                  ? 'bg-white border-amber-300 shadow-sm ring-2 ring-amber-200'
                  : 'bg-white/70 border-slate-200 hover:bg-white'
              }`}
            >
              <div className="text-[11px] font-bold text-amber-600 flex items-center gap-1">
                <span>🟠 퇴사/해촉 표기</span>
              </div>
              <div className="text-lg font-black text-amber-700 mt-0.5">{stats.empRetired}개</div>
            </button>

            <button
              onClick={() => setSelectedTab('org_missing')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                selectedTab === 'org_missing'
                  ? 'bg-white border-blue-300 shadow-sm ring-2 ring-blue-200'
                  : 'bg-white/70 border-slate-200 hover:bg-white'
              }`}
            >
              <div className="text-[11px] font-bold text-blue-600 flex items-center gap-1">
                <span>🔵 미등록 본부/지사</span>
              </div>
              <div className="text-lg font-black text-blue-700 mt-0.5">{stats.orgMissing}개</div>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleSelectAll}
                className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                {selectedUsernames.size === filteredList.length && filteredList.length > 0 ? (
                  <CheckSquare size={15} className="text-rose-600" />
                ) : (
                  <Square size={15} className="text-slate-400" />
                )}
                <span>
                  {selectedUsernames.size === filteredList.length && filteredList.length > 0
                    ? '선택 해제'
                    : '전체 선택'}
                </span>
              </button>

              <span className="text-xs text-slate-500 font-medium">
                {selectedUsernames.size}개 선택됨 (목록 총 {filteredList.length}건)
              </span>
            </div>

            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="아이디, 조직명, 사원명 검색..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:border-rose-400 focus:outline-none shadow-2xs"
              />
            </div>
          </div>
        </div>

        {/* 본문 테이블 영역 */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {filteredList.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
              <CheckCircle2 size={40} className="text-emerald-500" />
              <div className="text-center">
                <p className="text-sm font-bold text-slate-700">사원리스트와 완벽히 일치합니다!</p>
                <p className="text-xs text-slate-500 mt-1">
                  선택하신 분류에 해당하는 미존재 또는 삭제 대상 계정이 없습니다.
                </p>
              </div>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-black sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 text-center w-10">
                      <input
                        type="checkbox"
                        checked={selectedUsernames.size === filteredList.length && filteredList.length > 0}
                        onChange={handleToggleSelectAll}
                        className="rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                      />
                    </th>
                    <th className="px-3 py-2.5 w-12 text-center text-slate-400 font-mono">No</th>
                    <th className="px-3 py-2.5 w-24 whitespace-nowrap">구분(권한)</th>
                    <th className="px-3 py-2.5 min-w-[140px] whitespace-nowrap">로그인 아이디</th>
                    <th className="px-3 py-2.5 min-w-[160px] whitespace-nowrap">소속 조직명</th>
                    <th className="px-3 py-2.5 min-w-[120px] whitespace-nowrap">사원명</th>
                    <th className="px-3 py-2.5 min-w-[200px]">정리 분류 및 사유</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredList.map((item, idx) => {
                    const isChecked = selectedUsernames.has(item.username);
                    return (
                      <tr
                        key={item.username}
                        onClick={() => handleToggleItem(item.username)}
                        className={`cursor-pointer transition-colors ${
                          isChecked ? 'bg-rose-50/70 hover:bg-rose-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleItem(item.username)}
                            className="rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-center text-slate-400 font-mono text-[11px]">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black ${
                            item.primaryRole.includes('본부')
                              ? 'bg-blue-100 text-blue-700 border border-blue-200'
                              : item.primaryRole.includes('지사')
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              : 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                          }`}>
                            {item.primaryRole}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {item.username}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-bold border border-slate-200">
                            {item.orgEntries.map(o => o.orgName).join(', ')}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 font-bold whitespace-nowrap">
                          {item.empName ? (
                            <span>{item.empName} {item.empCode && <span className="text-[11px] text-slate-400">({item.empCode})</span>}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border shrink-0 ${
                              item.reasonType === 'emp_missing'
                                ? 'bg-rose-100 text-rose-700 border-rose-200'
                                : item.reasonType === 'emp_retired'
                                ? 'bg-amber-100 text-amber-800 border-amber-200'
                                : 'bg-blue-100 text-blue-700 border-blue-200'
                            }`}>
                              {item.reasonLabel}
                            </span>
                            <span className="text-slate-500 text-[11px] truncate" title={item.reasonDesc}>
                              {item.reasonDesc}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 하단 푸터 액션 */}
        <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldAlert size={16} className="text-amber-500 shrink-0" />
            <span>
              관리자/총무 및 현재 로그인된 계정은 보호를 위해 목록에서 자동 제외됩니다.
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={handleExecuteDelete}
              disabled={selectedUsernames.size === 0}
              className={`px-5 py-2 rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition-all cursor-pointer ${
                selectedUsernames.size > 0
                  ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200 ring-2 ring-rose-300'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Trash2 size={15} />
              <span>선택한 {selectedUsernames.size}개 계정 일괄 삭제</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

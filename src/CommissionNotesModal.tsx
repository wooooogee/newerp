import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Search, FileText, RefreshCw, AlertCircle, Calendar, User, DollarSign, Tag, CheckCircle2, ArrowRight, CheckSquare, Square, Layers, List } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ERPDataItem {
  uniqueKey: string;
  originalRowIdx: number;
  contractDate: string;
  memNo: string;
  memName: string;
  resNo: string;
  phone: string;
  prodName: string;
  rentalProd: string;
  rentalNo: string;
  deliveryStatus: string;
  deliveryDate: string;
  payDate: string;
  hq: string;
  branch: string;
  empName: string;
  empCode?: string;
  paymentStatus: string;
  status: string;
  memo: string;
  raw?: any[];
}

interface ProductRule {
  productName: string;
  totalAmount: number;
  salesAmount: number;
}

interface HQSetting {
  id: string;
  hqName: string;
  productRules: ProductRule[];
}

interface SelectedMemberInfo {
  uniqueKey: string;
  memName: string;
  rentalNo: string;
  payDate: string;
  prodName: string;
  hq: string;
  estimatedCommission: number;
}

interface CommissionNote {
  id: string;
  createdAt: string;
  type: string;
  target: string;
  amount: string;
  origDate: string;
  newDate: string;
  content: string;
  author: string;
  rowIndex?: number;
}

interface CommissionNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: string;
  data?: ERPDataItem[];
  hqSettings?: HQSetting[];
}

const CATEGORIES = ['전체', '선지급', '후지급', '정산차감', '지급보류', '기타'];
const INPUT_TYPES = ['선지급', '후지급', '정산차감', '지급보류', '기타'];

export function CommissionNotesModal({
  isOpen,
  onClose,
  currentUser = '관리자',
  data = [],
  hqSettings = [],
}: CommissionNotesModalProps) {
  // 모달 메인 탭: 'input' (특이사항 등록) vs 'history' (저장 내역 조회)
  const [activeMainTab, setActiveMainTab] = useState<'input' | 'history'>('input');

  const [notes, setNotes] = useState<CommissionNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 작성 폼 상태
  const [type, setType] = useState('선지급');
  const [selectedMembers, setSelectedMembers] = useState<SelectedMemberInfo[]>([]);
  const [memberSearchInput, setMemberSearchInput] = useState('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  
  const [customTarget, setCustomTarget] = useState(''); // 수동 입력 대상
  const [amount, setAmount] = useState('');
  const [origDate, setOrigDate] = useState('');
  const [newDate, setNewDate] = useState('');
  const [content, setContent] = useState('');
  const [author, setAuthor] = useState(currentUser);

  // 검색 및 필터 (내역 탭)
  const [selectedCategory, setSelectedCategory] = useState('전체');
  const [searchQuery, setSearchQuery] = useState('');

  const searchRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 회원 검색 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 수수료 금액 자동 계산 헬퍼
  const getCommissionForMember = (item: ERPDataItem): number => {
    if (!item.hq || !item.prodName) return 0;
    const hqSet = hqSettings.find(h => h.hqName === item.hq);
    if (!hqSet) return 0;
    const rule = hqSet.productRules.find(p => p.productName === item.prodName);
    return rule ? rule.totalAmount || rule.salesAmount || 0 : 0;
  };

  // 회원 선택 목록 변경 시 수수료 금액 & 기존날짜 자동 갱신
  useEffect(() => {
    if (selectedMembers.length > 0) {
      // 선택된 회원들의 총 수수료 계산
      const totalComm = selectedMembers.reduce((sum, m) => sum + m.estimatedCommission, 0);
      if (totalComm > 0) {
        setAmount(totalComm.toLocaleString());
      }
      // 기존 날짜 세팅 (첫번째 선택 회원의 payDate)
      const firstPayDate = selectedMembers.find(m => m.payDate)?.payDate;
      if (firstPayDate && !origDate) {
        setOrigDate(firstPayDate);
      }
    }
  }, [selectedMembers]);

  // 데이터 로드
  const loadNotes = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sheets/commission-notes');
      if (res.ok) {
        const result = await res.json();
        setNotes(result.notes || []);
      }
    } catch (err) {
      console.error('Failed to load commission notes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadNotes();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 회원 검색 후보 목록
  const filteredCandidates = memberSearchInput.trim()
    ? data.filter(item => {
        const query = memberSearchInput.toLowerCase().trim();
        return (
          (item.memName && item.memName.toLowerCase().includes(query)) ||
          (item.rentalNo && item.rentalNo.toLowerCase().includes(query)) ||
          (item.memNo && item.memNo.toLowerCase().includes(query)) ||
          (item.phone && item.phone.includes(query)) ||
          (item.prodName && item.prodName.toLowerCase().includes(query))
        );
      }).slice(0, 15)
    : [];

  // 개별 회원 토글 (체크박스)
  const handleToggleMember = (item: ERPDataItem) => {
    const exists = selectedMembers.some(m => m.uniqueKey === item.uniqueKey);
    if (exists) {
      setSelectedMembers(prev => prev.filter(m => m.uniqueKey !== item.uniqueKey));
    } else {
      const comm = getCommissionForMember(item);
      const newMember: SelectedMemberInfo = {
        uniqueKey: item.uniqueKey,
        memName: item.memName || '무명',
        rentalNo: item.rentalNo || item.memNo || '-',
        payDate: item.payDate || '',
        prodName: item.prodName || '',
        hq: item.hq || '',
        estimatedCommission: comm,
      };
      setSelectedMembers(prev => [...prev, newMember]);
    }
  };

  // 검색 결과 전체 선택/해제
  const handleSelectAllCandidates = () => {
    const allSelected = filteredCandidates.every(item =>
      selectedMembers.some(m => m.uniqueKey === item.uniqueKey)
    );

    if (allSelected) {
      // 검색된 항목 모두 제거
      const candidateKeys = new Set(filteredCandidates.map(c => c.uniqueKey));
      setSelectedMembers(prev => prev.filter(m => !candidateKeys.has(m.uniqueKey)));
    } else {
      // 검색된 항목 모두 추가
      const newMembers: SelectedMemberInfo[] = filteredCandidates
        .filter(item => !selectedMembers.some(m => m.uniqueKey === item.uniqueKey))
        .map(item => ({
          uniqueKey: item.uniqueKey,
          memName: item.memName || '무명',
          rentalNo: item.rentalNo || item.memNo || '-',
          payDate: item.payDate || '',
          prodName: item.prodName || '',
          hq: item.hq || '',
          estimatedCommission: getCommissionForMember(item),
        }));

      setSelectedMembers(prev => [...prev, ...newMembers]);
    }
  };

  // 선택된 회원 제거
  const handleRemoveMember = (uniqueKey: string) => {
    setSelectedMembers(prev => prev.filter(m => m.uniqueKey !== uniqueKey));
  };

  // 신규 등록 및 시트 저장
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      alert('특이사항 내용을 입력해주세요.');
      return;
    }

    // 최종 target 조합: 선택된 회원들 문자열 + 수동 입력
    let finalTarget = selectedMembers
      .map(m => `${m.memName}(계약:${m.rentalNo})`)
      .join(', ');
    
    if (customTarget.trim()) {
      finalTarget = finalTarget ? `${finalTarget} / ${customTarget.trim()}` : customTarget.trim();
    }

    setSaving(true);
    try {
      const res = await fetch('/api/sheets/commission-notes/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          target: finalTarget,
          amount,
          origDate,
          newDate,
          content,
          author: author || '관리자',
        }),
      });

      if (res.ok) {
        // Reset form
        setContent('');
        setSelectedMembers([]);
        setCustomTarget('');
        setAmount('');
        setOrigDate('');
        setNewDate('');
        await loadNotes();
        // 저장 성공 시 저장 내역 탭으로 자동 이동하여 결과 확인
        setActiveMainTab('history');
      } else {
        const err = await res.json();
        alert(err.error || '저장에 실패했습니다.');
      }
    } catch (err) {
      console.error('Failed to save note:', err);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 삭제
  const handleDelete = async (id: string) => {
    if (!confirm('이 수수료 특이사항 항목을 삭제하시겠습니까?')) return;
    setDeletingId(id);
    try {
      const res = await fetch('/api/sheets/commission-notes/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      if (res.ok) {
        setNotes(prev => prev.filter(n => n.id !== id));
      } else {
        const err = await res.json();
        alert(err.error || '삭제 실패');
      }
    } catch (err) {
      console.error('Failed to delete note:', err);
      alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  // 필터링된 내역 데이터
  const filteredNotes = notes.filter(n => {
    const matchesCategory = selectedCategory === '전체' || n.type === selectedCategory;
    const matchesSearch =
      !searchQuery.trim() ||
      n.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.target.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.origDate.includes(searchQuery) ||
      n.newDate.includes(searchQuery);
    return matchesCategory && matchesSearch;
  });

  const getTypeBadgeStyle = (noteType: string) => {
    switch (noteType) {
      case '선지급':
        return 'bg-blue-600 text-white font-bold shadow-sm shadow-blue-200';
      case '후지급':
        return 'bg-purple-600 text-white font-bold shadow-sm shadow-purple-200';
      case '정산차감':
        return 'bg-rose-600 text-white font-bold shadow-sm shadow-rose-200';
      case '지급보류':
        return 'bg-amber-600 text-white font-bold shadow-sm shadow-amber-200';
      default:
        return 'bg-slate-700 text-white font-bold';
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Background backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
      />

      {/* Modal Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative bg-slate-50 w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[90vh]"
      >
        {/* Header & Main Tabs */}
        <div className="px-8 pt-5 pb-0 bg-white border-b border-slate-200 flex flex-col shrink-0">
          <div className="flex justify-between items-center pb-4">
            <div className="flex items-center gap-3.5">
              <div className="bg-amber-500 p-2.5 rounded-2xl shadow-lg shadow-amber-200 text-white">
                <FileText size={22} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 leading-tight flex items-center gap-2">
                  수수료 관련 특이사항
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">
                    구글시트 연동
                  </span>
                </h3>
                <p className="text-[12px] font-medium text-slate-500 tracking-tight">
                  선지급, 후지급, 정산차감 및 회원별 수수료 변경/연기 특이사항 관리
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadNotes}
                disabled={loading}
                className="p-2.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                title="새로고침"
              >
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
              >
                <X size={22} />
              </button>
            </div>
          </div>

          {/* 메인 탭 네비게이션 (입력/등록 vs 내역 조회) */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveMainTab('input')}
              className={`flex items-center gap-2 px-5 py-3 border-b-2 font-bold text-xs transition-all cursor-pointer ${
                activeMainTab === 'input'
                  ? 'border-amber-500 text-amber-600 bg-amber-50/40 rounded-t-xl'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-t-xl'
              }`}
            >
              <Plus size={16} />
              <span>특이사항 등록/작성</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMainTab('history')}
              className={`flex items-center gap-2 px-5 py-3 border-b-2 font-bold text-xs transition-all cursor-pointer ${
                activeMainTab === 'history'
                  ? 'border-amber-500 text-amber-600 bg-amber-50/40 rounded-t-xl'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-t-xl'
              }`}
            >
              <List size={16} />
              <span>저장된 내역 보기</span>
              <span className="ml-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px]">
                {notes.length}
              </span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-auto p-6 md:p-8">
          {/* TAB 1: 특이사항 등록/작성 */}
          {activeMainTab === 'input' && (
            <motion.form
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleSave}
              className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-sm font-black text-slate-800">
                  <Plus size={16} className="text-amber-500" />
                  <span>신규 수수료 특이사항 입력</span>
                </div>

                {/* 구분 선택 뱃지 버튼 */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-400 mr-1">구분:</span>
                  {INPUT_TYPES.map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        type === t
                          ? getTypeBadgeStyle(t)
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* 회원 검색 및 체크박스 멀티 선택 UI */}
              <div className="space-y-2.5">
                <div className="flex justify-between items-center">
                  <label className="block text-[11px] font-bold text-slate-600 flex items-center gap-1">
                    <User size={13} className="text-amber-500" /> 관련 대상 / 회원 검색 (다중 바로 선택 가능)
                  </label>
                  {selectedMembers.length > 0 && (
                    <span className="text-[11px] font-bold text-amber-600">
                      선택된 회원: <span className="font-black text-amber-700">{selectedMembers.length}</span>명
                    </span>
                  )}
                </div>

                <div ref={searchRef} className="relative">
                  <div className="relative">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={memberSearchInput}
                      onChange={e => {
                        setMemberSearchInput(e.target.value);
                        setIsSearchDropdownOpen(true);
                      }}
                      onFocus={() => setIsSearchDropdownOpen(true)}
                      placeholder="회원명, 렌탈계약번호, 전화번호 검색 시 아래 체크박스로 바로 다중 선택..."
                      className="w-full text-xs pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                    />
                  </div>

                  {/* 검색 결과 체크박스 다중 바로 선택 드롭다운 */}
                  {isSearchDropdownOpen && filteredCandidates.length > 0 && (
                    <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-64 overflow-auto divide-y divide-slate-100">
                      {/* 전체 선택 헤더 바 */}
                      <div className="p-2.5 bg-slate-50 flex items-center justify-between text-xs sticky top-0 border-b border-slate-200">
                        <button
                          type="button"
                          onClick={handleSelectAllCandidates}
                          className="flex items-center gap-1.5 font-bold text-amber-700 hover:text-amber-800 cursor-pointer"
                        >
                          {filteredCandidates.every(item =>
                            selectedMembers.some(m => m.uniqueKey === item.uniqueKey)
                          ) ? (
                            <CheckSquare size={16} className="text-amber-600" />
                          ) : (
                            <Square size={16} className="text-slate-400" />
                          )}
                          <span>검색된 {filteredCandidates.length}명 전체 선택/해제</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsSearchDropdownOpen(false)}
                          className="text-[11px] font-bold text-slate-400 hover:text-slate-700 cursor-pointer"
                        >
                          닫기 ✕
                        </button>
                      </div>

                      {/* 회원 개별 선택 목록 */}
                      {filteredCandidates.map(item => {
                        const isChecked = selectedMembers.some(m => m.uniqueKey === item.uniqueKey);
                        const comm = getCommissionForMember(item);

                        return (
                          <div
                            key={item.uniqueKey}
                            onClick={() => handleToggleMember(item)}
                            className={`p-3 cursor-pointer flex items-center justify-between text-xs transition-colors ${
                              isChecked ? 'bg-amber-50/70 font-bold' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {isChecked ? (
                                <CheckSquare size={16} className="text-amber-600 shrink-0" />
                              ) : (
                                <Square size={16} className="text-slate-300 shrink-0" />
                              )}
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-800">{item.memName}</span>
                                  <span className="text-[11px] text-slate-400">계약: {item.rentalNo || item.memNo}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                                    {item.prodName}
                                  </span>
                                </div>
                                {item.hq && (
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    소속: {item.hq} {item.branch ? `/ ${item.branch}` : ''}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              {comm > 0 && (
                                <div className="text-xs font-black text-amber-600">
                                  수수료: {comm.toLocaleString()}원
                                </div>
                              )}
                              {item.payDate && (
                                <div className="text-[10px] font-bold text-slate-400">
                                  예정일: {item.payDate}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 선택된 회원 태그/칩 목록 */}
                {selectedMembers.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {selectedMembers.map(m => (
                      <span
                        key={m.uniqueKey}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-900 shadow-sm"
                      >
                        <User size={13} className="text-amber-600" />
                        <span>{m.memName}</span>
                        <span className="text-[10px] text-amber-700 font-normal">({m.rentalNo})</span>
                        {m.estimatedCommission > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-amber-200/60 rounded text-amber-950 font-bold">
                            {m.estimatedCommission.toLocaleString()}원
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(m.uniqueKey)}
                          className="p-0.5 hover:bg-amber-200 rounded-full transition-colors cursor-pointer ml-1"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSelectedMembers([])}
                      className="text-[11px] text-slate-400 hover:text-rose-600 underline font-bold px-2 cursor-pointer"
                    >
                      전체 해제
                    </button>
                  </div>
                )}
              </div>

              {/* 입력 필드들: 수동대상 / 수수료 금액 / 기존날짜 / 수정날짜 / 작성자 */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-2">
                {/* 수동 대상 */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    기타 직접 대상
                  </label>
                  <input
                    type="text"
                    value={customTarget}
                    onChange={e => setCustomTarget(e.target.value)}
                    placeholder="직접 입력 대상 (선택)"
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>

                {/* 수수료 금액 (자동 세팅 + 직접 수정 가능) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
                    <DollarSign size={12} className="text-amber-500" /> 수수료 금액 (자동/수정)
                  </label>
                  <input
                    type="text"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="예: 500,000"
                    className="w-full text-xs font-bold text-amber-800 bg-amber-50/50 border border-amber-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>

                {/* 기존날짜 (자동 세팅 + 직접 수정 가능) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
                    <Calendar size={12} className="text-slate-400" /> 기존날짜 (원 예정일)
                  </label>
                  <input
                    type="text"
                    value={origDate}
                    onChange={e => setOrigDate(e.target.value)}
                    placeholder="예: 2026-08-18"
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>

                {/* 수정날짜 */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
                    <Calendar size={12} className="text-amber-500" /> 수정날짜 (변경 예정일)
                  </label>
                  <input
                    type="text"
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                    placeholder="예: 2026-08-25"
                    className="w-full text-xs font-bold text-amber-700 bg-slate-50 border border-amber-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>

                {/* 작성자 */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
                    <User size={12} /> 작성자
                  </label>
                  <input
                    type="text"
                    value={author}
                    onChange={e => setAuthor(e.target.value)}
                    placeholder="작성자명"
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>
              </div>

              {/* 특이사항 내용 */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  특이사항 내용 <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="선지급, 후지급 사유나 수수료 관련 변경 사유를 입력하세요."
                  rows={3}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-2xl p-3.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none font-medium"
                />
              </div>

              {/* 저장 버튼 */}
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={saving || !content.trim()}
                  className="px-8 py-3 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 disabled:opacity-50 text-white rounded-2xl text-xs font-black shadow-lg shadow-amber-200 flex items-center gap-2 transition-all cursor-pointer"
                >
                  {saving ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>구글 시트에 저장 중...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>특이사항 저장 및 내역으로 이동</span>
                    </>
                  )}
                </button>
              </div>
            </motion.form>
          )}

          {/* TAB 2: 저장된 내역 보기 */}
          {activeMainTab === 'history' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* 검색 및 카테고리 서브 필터 바 */}
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center bg-white p-4 rounded-2xl border border-slate-200">
                {/* 카테고리 필터 */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                        selectedCategory === cat
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* 검색창 */}
                <div className="relative min-w-[260px]">
                  <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="회원/내용/날짜/작성자 검색..."
                    className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400/20"
                  />
                </div>
              </div>

              {/* 목록 개수 및 상태 */}
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span className="font-bold">
                  총 <span className="text-amber-600 font-black">{filteredNotes.length}</span>건의 특이사항
                </span>
              </div>

              {loading ? (
                <div className="bg-white rounded-3xl border border-slate-200 p-16 flex flex-col items-center justify-center text-slate-400 space-y-3">
                  <RefreshCw size={32} className="animate-spin text-amber-500" />
                  <p className="text-xs font-bold">수수료 특이사항 불러오는 중...</p>
                </div>
              ) : filteredNotes.length === 0 ? (
                <div className="bg-white rounded-3xl border border-slate-200 p-16 flex flex-col items-center justify-center text-slate-400 space-y-3 text-center">
                  <AlertCircle size={36} className="text-slate-300" />
                  <p className="text-sm font-bold text-slate-700">저장된 수수료 특이사항이 없습니다.</p>
                  <p className="text-xs text-slate-400">
                    상단 <b>'특이사항 등록/작성'</b> 탭에서 선지급, 후지급 등의 메모를 등록해보세요.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveMainTab('input')}
                    className="mt-2 px-4 py-2 bg-amber-500 text-white font-bold rounded-xl text-xs shadow-md shadow-amber-200 hover:bg-amber-600 transition-all cursor-pointer"
                  >
                    + 특이사항 등록하러 가기
                  </button>
                </div>
              ) : (
                <div className="grid gap-3.5">
                  {filteredNotes.map(note => (
                    <motion.div
                      key={note.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-slate-300 transition-all space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* 구분 뱃지 */}
                          <span
                            className={`px-3 py-1 rounded-xl text-xs font-bold ${getTypeBadgeStyle(
                              note.type
                            )}`}
                          >
                            {note.type}
                          </span>

                          {/* 관련 대상 */}
                          {note.target && (
                            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5 bg-slate-100 px-3 py-1 rounded-xl border border-slate-200">
                              <User size={13} className="text-slate-500" />
                              {note.target}
                            </span>
                          )}

                          {/* 금액 */}
                          {note.amount && (
                            <span className="text-xs font-black text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded-xl">
                              {note.amount}원
                            </span>
                          )}

                          {/* 기존날짜 -> 수정날짜 뱃지 */}
                          {(note.origDate || note.newDate) && (
                            <div className="flex items-center gap-2 text-xs font-bold bg-slate-50 border border-slate-200 px-3 py-1 rounded-xl text-slate-700">
                              <Calendar size={13} className="text-slate-400" />
                              <span>{note.origDate || '기존미정'}</span>
                              <ArrowRight size={13} className="text-amber-500" />
                              <span className="text-amber-700 font-extrabold">{note.newDate || '수정미정'}</span>
                            </div>
                          )}
                        </div>

                        {/* 등록 정보 및 삭제 */}
                        <div className="flex items-center gap-3 text-xs text-slate-400 shrink-0">
                          <span>등록일: {note.createdAt}</span>
                          <span>|</span>
                          <span>작성자: {note.author}</span>
                          <button
                            type="button"
                            onClick={() => handleDelete(note.id)}
                            disabled={deletingId === note.id}
                            className="p-1 text-slate-300 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer ml-1"
                            title="삭제"
                          >
                            {deletingId === note.id ? (
                              <RefreshCw size={15} className="animate-spin text-rose-500" />
                            ) : (
                              <Trash2 size={15} />
                            )}
                          </button>
                        </div>
                      </div>

                      <p className="text-xs text-slate-700 font-medium whitespace-pre-wrap leading-relaxed bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
                        {note.content}
                      </p>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 bg-white border-t border-slate-200 flex justify-between items-center shrink-0">
          <div className="text-xs text-slate-400 font-medium">
            💡 작성 및 저장 시 구글 스프레드시트의 <span className="font-bold text-slate-600">'수수료특이사항'</span> 시트에 실시간 기록됩니다.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
          >
            닫기
          </button>
        </div>
      </motion.div>
    </div>
  );
}

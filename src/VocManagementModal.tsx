import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Filter, Plus, Edit3, Trash2, Download, RefreshCw, MessageSquare, CheckCircle2, Clock, AlertCircle, Calendar, User, Phone, Building, Check, Loader2, Send, CornerDownRight, UserCheck, CreditCard, Tag, ShieldAlert, FileText, Layers, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const XLSX = (window as any).XLSX;

export interface VocComment {
  id: string;
  createdAt: string; // YYYY-MM-DD HH:mm:ss
  writer: string;
  content: string;
}

export interface VocItem {
  id: string;
  regDate: string;      // 접수일자 (YYYY-MM-DD)
  customerName: string; // 회원명 (고객명)
  phone: string;        // 회원연락처
  memNo?: string;       // 회원번호 (여러개 지원)
  allMemNos?: string;   // 보유 회원번호 전체 목록
  rentalNo?: string;    // 렌탈번호
  rentalProd?: string;  // 렌탈상품명
  contractDate?: string;// 계약일자
  statusB?: string;     // 가입상태 (가입, 유지, 해지, 취소 등)
  hqName: string;       // 본부명
  branchName: string;   // 지사명
  empName?: string;     // 영업사원
  empPhone?: string;    // 영업사원연락처 (사원리스트 L열 매칭)
  empInfo?: string;     // 영업사원 정보 (성함/연락처)
  category: string;     // 접수유형 (계약/정산, 배송/설치, 해지/환불, 제품/품질, 서비스/불친절, 기타)
  status: '접수' | '처리중' | '완료' | '보류'; // 처리상태
  title: string;        // VOC 제목
  content: string;      // 상세내용
  processResult: string;// 처리내용 / 답변
  manager: string;      // 담당자
  completeDate: string; // 완료일자
  comments?: VocComment[]; // 코멘트 히스토리
}

interface VocManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  hqs?: string[];       // 본부 목록
  erpData?: any[];      // ERP 전체 계약/회원 데이터
  isHQStaff?: boolean;  // 본부 계정 여부
  userHqs?: string[];   // 본부 계정의 본부명 목록
}

// Fallback 영업사원 연락처 정밀 추출 함수
const extractEmpPhoneFallback = (raw: any[], customerPhone: string): string => {
  if (!Array.isArray(raw)) return '';
  const cleanCustomerPhone = (customerPhone || '').replace(/[^0-9]/g, '');

  const phoneRegex = /01[016789]-?\d{3,4}-?\d{4}/g;
  const rawJoined = raw.join(' ');
  const matches = rawJoined.match(phoneRegex) || [];

  for (const p of matches) {
    const cleanP = p.replace(/[^0-9]/g, '');
    if (cleanP && cleanP !== cleanCustomerPhone) {
      return cleanP.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
    }
  }
  return '';
};

export function VocManagementModal({ isOpen, onClose, hqs = [], erpData = [], isHQStaff = false, userHqs = [] }: VocManagementModalProps) {
  const [vocList, setVocList] = useState<VocItem[]>([]);
  const [empList, setEmpList] = useState<any[]>([]); // 사원리스트 데이터
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 검색 및 필터 상태
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('전체');
  const [categoryFilter, setCategoryFilter] = useState<string>('전체');
  const [startDateFilter, setStartDateFilter] = useState<string>('');
  const [endDateFilter, setEndDateFilter] = useState<string>('');

  // 등록/수정 모달 폼 상태
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // 회원/계약 상세 연동 정보 필드 (11가지 핵심 정보)
  const [formRegDate, setFormRegDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formCustomerName, setFormCustomerName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formMemNo, setFormMemNo] = useState('');
  const [formAllMemNos, setFormAllMemNos] = useState(''); // 보유 회원번호 전체 목록
  const [formRentalNo, setFormRentalNo] = useState('');
  const [formRentalProd, setFormRentalProd] = useState('');
  const [formContractDate, setFormContractDate] = useState(''); // 계약일자
  const [formStatusB, setFormStatusB] = useState('');           // 가입상태 (B열)
  const [formHqName, setFormHqName] = useState('');
  const [formBranchName, setFormBranchName] = useState('');
  const [formEmpName, setFormEmpName] = useState('');
  const [formEmpPhone, setFormEmpPhone] = useState('');

  // VOC 내용 필드
  const [formCategory, setFormCategory] = useState('계약/정산');
  const [formStatus, setFormStatus] = useState<'접수' | '처리중' | '완료' | '보류'>('접수');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formProcessResult, setFormProcessResult] = useState('');
  const [formManager, setFormManager] = useState('');
  const [formCompleteDate, setFormCompleteDate] = useState('');

  // 코멘트 히스토리 상태
  const [comments, setComments] = useState<VocComment[]>([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [newCommentWriter, setNewCommentWriter] = useState('');

  // 회원 자동완성 검색 추천 드롭다운 상태
  const [searchMemberQuery, setSearchMemberQuery] = useState('');
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);

  // VOC 데이터 및 사원리스트 데이터 불러오기
  const fetchVocData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sheets/voc');
      if (!res.ok) throw new Error('VOC 데이터를 불러올 수 없습니다.');
      const data = await res.json();
      setVocList(data.vocList || []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmpList = async () => {
    try {
      const res = await fetch(`/api/sheets/sheetData?sheetName=${encodeURIComponent('사원리스트')}&t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        const rows = Array.isArray(data) ? data : (data.rows || []);
        console.log('[VocManagementModal] Loaded empList count:', rows.length);
        setEmpList(rows);
      }
    } catch (e) {
      console.error('[VocManagementModal] 사원리스트 로딩 실패:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchVocData();
      fetchEmpList();
    }
  }, [isOpen]);

  // 사원리스트(empList) 스마트 매칭 맵 구축 (행 전체 010 전화번호와 모든 사원 성함/코드 매핑)
  const { empCodePhoneMap, empNamePhoneMap } = useMemo(() => {
    const codeMap = new Map<string, string>();
    const nameMap = new Map<string, string>();

    empList.forEach(empRow => {
      if (!Array.isArray(empRow)) return;

      let rowPhone = '';
      const phoneRegex = /01[016789]-?\d{3,4}-?\d{4}/;

      for (let i = 0; i < empRow.length; i++) {
        const cellVal = String(empRow[i] || '').trim();
        const match = cellVal.match(phoneRegex);
        if (match) {
          rowPhone = match[0].replace(/[^0-9]/g, '').replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
          break;
        }
      }

      if (rowPhone) {
        empRow.forEach(cell => {
          const val = String(cell || '').trim();
          if (!val || val === '-' || val.includes('010') || val.length > 25) return;

          const cleanKey = val.replace(/\s+/g, '').toUpperCase();
          if (cleanKey.length >= 2) {
            nameMap.set(cleanKey, rowPhone);
            if (/^[A-Z0-9]+$/.test(cleanKey)) {
              codeMap.set(cleanKey, rowPhone);
            }
          }
        });
      }
    });

    return { empCodePhoneMap: codeMap, empNamePhoneMap: nameMap };
  }, [empList]);

  // VOC 데이터 저장
  const saveVocData = async (newList: VocItem[]) => {
    setSaving(true);
    try {
      const res = await fetch('/api/sheets/voc/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vocList: newList })
      });
      if (!res.ok) throw new Error('저장 중 오류가 발생했습니다.');
      setVocList(newList);
    } catch (e: any) {
      alert(e.message || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 폼 초기화
  const resetForm = () => {
    setEditingId(null);
    setFormRegDate(new Date().toISOString().split('T')[0]);
    setFormCustomerName('');
    setFormPhone('');
    setFormMemNo('');
    setFormAllMemNos('');
    setFormRentalNo('');
    setFormRentalProd('');
    setFormContractDate('');
    setFormStatusB('');
    setFormHqName('');
    setFormBranchName('');
    setFormEmpName('');
    setFormEmpPhone('');
    setFormCategory('계약/정산');
    setFormStatus('접수');
    setFormTitle('');
    setFormContent('');
    setFormProcessResult('');
    setFormManager('');
    setFormCompleteDate('');
    setComments([]);
    setNewCommentText('');
    setNewCommentWriter('');
    setSearchMemberQuery('');
    setShowMemberDropdown(false);
  };

  // 회원 자동완성 검색 추천 데이터 (상품/렌탈계약번호 기준 유일 노출)
  const matchedMembers = useMemo(() => {
    if (!searchMemberQuery || searchMemberQuery.trim().length < 2) return [];
    const q = searchMemberQuery.trim().toLowerCase();

    // 1단계: 검색 매칭 행 탐색
    const rawMatches: any[] = [];
    for (const item of erpData) {
      const memName = (item.memName || '').toString();
      const phone = (item.phone || '').toString();
      const memNo = (item.memNo || '').toString();
      const rentalNo = (item.rentalNo || '').toString();

      if (
        memName.toLowerCase().includes(q) ||
        phone.includes(q) ||
        memNo.toLowerCase().includes(q) ||
        rentalNo.toLowerCase().includes(q)
      ) {
        rawMatches.push(item);
      }
    }

    // 2단계: 렌탈계약번호(rentalNo) 기준 상품별 1건씩 유일 그룹화 (동일 렌탈계약번호 중복 제거)
    const resultMap: Map<string, any> = new Map();

    for (const item of rawMatches) {
      const memName = (item.memName || '').trim();
      const phone = (item.phone || '').trim();
      const rentalNo = (item.rentalNo || '').trim();

      // 동일 렌탈계약번호(rentalNo)를 최우선 유일 키로 사용하여 중복 제거
      const uniqueItemKey = rentalNo
        ? `RENTAL_${rentalNo.toUpperCase()}`
        : `MEM_${memName}_${phone}_${item.memNo || ''}`;

      if (resultMap.has(uniqueItemKey)) {
        continue; // 이미 등록된 렌탈계약번호건은 중복 노출하지 않음
      }

      // 고객의 ERP 내 전체 보유 회원번호 & 전체 계약건 탐색
      const allUserItems = erpData.filter(e => {
        const eName = (e.memName || '').trim();
        const ePhone = (e.phone || '').replace(/[^0-9]/g, '');
        return (phone && ePhone === phone.replace(/[^0-9]/g, '')) || (memName && eName.toLowerCase() === memName.toLowerCase());
      });

      const allMemNos = Array.from(new Set(allUserItems.map(e => (e.memNo || '').trim()).filter(Boolean)));
      const allRentalNos = Array.from(new Set(allUserItems.map(e => (e.rentalNo || '').trim()).filter(Boolean)));

      // 영업사원 성함 및 사원코드 정밀 매칭
      const empCodeRaw = String(item.empCode || item.raw?.[27] || item.raw?.[39] || '').trim().toUpperCase();
      const empNameRaw = String(item.empName || item.raw?.[9] || '').trim();

      const cleanEmpCode = empCodeRaw.replace(/\s+/g, '');
      const cleanEmpName = empNameRaw.replace(/\s+/g, '').toUpperCase();

      let empPhone = empCodePhoneMap.get(cleanEmpCode) || empNamePhoneMap.get(cleanEmpName) || '';

      if (!empPhone && item.raw && Array.isArray(item.raw)) {
        const phoneRegex = /01[016789]-?\d{3,4}-?\d{4}/g;
        const rawStr = item.raw.join(' ');
        const matches = rawStr.match(phoneRegex) || [];
        const cleanCustPhone = phone.replace(/[^0-9]/g, '');

        for (const p of matches) {
          const cleanP = p.replace(/[^0-9]/g, '');
          if (cleanP && cleanP !== cleanCustPhone) {
            empPhone = cleanP.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
            break;
          }
        }
      }

      resultMap.set(uniqueItemKey, {
        memName: item.memName || '',
        phone: item.phone || '',
        memNo: item.memNo || '',
        allMemNos: allMemNos.join(', '),
        allMemNoCount: allMemNos.length,
        rentalNo: rentalNo,
        rentalProd: item.rentalProd || item.prodName || '',
        contractDate: item.contractDate || '',
        statusB: item.status || '',
        hq: item.hq || '',
        branch: item.branch || '',
        empName: empNameRaw,
        empPhone: empPhone,
        totalContractsCount: allRentalNos.length || allUserItems.length
      });

      if (resultMap.size >= 25) break; // 최대 25건 추천
    }

    return Array.from(resultMap.values());
  }, [erpData, searchMemberQuery, empCodePhoneMap, empNamePhoneMap]);

  // 회원 선택 시 11가지 상세 정보 자동 채움
  const handleSelectMember = (m: any) => {
    setFormCustomerName(m.memName);
    setFormPhone(m.phone);
    setFormMemNo(m.memNo);
    setFormAllMemNos(m.allMemNos || m.memNo);
    setFormRentalNo(m.rentalNo);
    setFormRentalProd(m.rentalProd);
    setFormContractDate(m.contractDate);
    setFormStatusB(m.statusB);
    setFormHqName(m.hq);
    setFormBranchName(m.branch);
    setFormEmpName(m.empName);
    setFormEmpPhone(m.empPhone);

    setSearchMemberQuery(`${m.memName} (${m.phone})`);
    setShowMemberDropdown(false);
  };

  // 등록 모달 오픈
  const handleOpenAddForm = () => {
    resetForm();
    setIsFormOpen(true);
  };

  // 수정 모달 오픈
  const handleOpenEditForm = (item: VocItem) => {
    setEditingId(item.id);
    setFormRegDate(item.regDate || new Date().toISOString().split('T')[0]);
    setFormCustomerName(item.customerName || '');
    setFormPhone(item.phone || '');
    setFormMemNo(item.memNo || '');
    setFormAllMemNos(item.allMemNos || item.memNo || '');
    setFormRentalNo(item.rentalNo || '');
    setFormRentalProd(item.rentalProd || '');
    setFormContractDate(item.contractDate || '');
    setFormStatusB(item.statusB || '');
    setFormHqName(item.hqName || '');
    setFormBranchName(item.branchName || '');

    let eName = item.empName || '';
    let ePhone = item.empPhone || '';
    if (!eName && item.empInfo) {
      const parts = item.empInfo.split('(');
      eName = parts[0].trim();
      ePhone = parts[1] ? parts[1].replace(')', '').replace('📞', '').trim() : '';
    }

    if (!ePhone && eName) {
      const cleanName = eName.replace(/\s+/g, '').toUpperCase();
      ePhone = empNamePhoneMap.get(cleanName) || '';
    }

    setFormEmpName(eName);
    setFormEmpPhone(ePhone);

    setFormCategory(item.category || '계약/정산');
    setFormStatus(item.status || '접수');
    setFormTitle(item.title || '');
    setFormContent(item.content || '');
    setFormProcessResult(item.processResult || '');
    setFormManager(item.manager || '');
    setFormCompleteDate(item.completeDate || '');
    setComments(item.comments || []);
    setNewCommentText('');
    setNewCommentWriter(item.manager || '');
    setSearchMemberQuery(item.customerName ? `${item.customerName} (${item.phone || ''})` : '');
    setShowMemberDropdown(false);
    setIsFormOpen(true);
  };

  // 코멘트 추가 핸들러
  const handleAddComment = () => {
    if (!newCommentText.trim()) {
      alert('코멘트 내용을 입력해주세요.');
      return;
    }

    const nowStr = new Date().toLocaleString('sv-SE').replace('T', ' '); // YYYY-MM-DD HH:mm:ss
    const newComment: VocComment = {
      id: `cmt-${Date.now()}`,
      createdAt: nowStr,
      writer: newCommentWriter.trim() || formManager.trim() || '담당자',
      content: newCommentText.trim()
    };

    const updatedComments = [...comments, newComment];
    setComments(updatedComments);
    setNewCommentText('');
  };

  // 코멘트 삭제
  const handleDeleteComment = (commentId: string) => {
    setComments(prev => prev.filter(c => c.id !== commentId));
  };

  // 폼 제출
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCustomerName.trim()) {
      alert('회원명(고객명)을 입력해주세요.');
      return;
    }
    if (!formTitle.trim()) {
      alert('VOC 제목을 입력해주세요.');
      return;
    }

    const empInfoStr = formEmpName ? `${formEmpName}${formEmpPhone ? ` (${formEmpPhone})` : ''}` : '';

    const newItem: VocItem = {
      id: editingId || `VOC-${Date.now()}`,
      regDate: formRegDate,
      customerName: formCustomerName.trim(),
      phone: formPhone.trim(),
      memNo: formMemNo.trim(),
      allMemNos: formAllMemNos.trim(),
      rentalNo: formRentalNo.trim(),
      rentalProd: formRentalProd.trim(),
      contractDate: formContractDate.trim(),
      statusB: formStatusB.trim(),
      hqName: formHqName.trim(),
      branchName: formBranchName.trim(),
      empName: formEmpName.trim(),
      empPhone: formEmpPhone.trim(),
      empInfo: empInfoStr,
      category: formCategory,
      status: formStatus,
      title: formTitle.trim(),
      content: formContent.trim(),
      processResult: formProcessResult.trim(),
      manager: formManager.trim(),
      completeDate: formStatus === '완료' ? (formCompleteDate || new Date().toISOString().split('T')[0]) : formCompleteDate,
      comments: comments
    };

    let updatedList: VocItem[];
    if (editingId) {
      updatedList = vocList.map(item => item.id === editingId ? newItem : item);
    } else {
      updatedList = [newItem, ...vocList];
    }

    await saveVocData(updatedList);
    setIsFormOpen(false);
    resetForm();
  };

  // VOC 삭제
  const handleDelete = async (id: string) => {
    if (!window.confirm('해당 VOC 건을 삭제하시겠습니까?')) return;
    const updatedList = vocList.filter(item => item.id !== id);
    await saveVocData(updatedList);
  };

  // 상태 빠른 변경
  const handleStatusQuickChange = async (item: VocItem, newStatus: '접수' | '처리중' | '완료' | '보류') => {
    const updatedItem: VocItem = {
      ...item,
      status: newStatus,
      completeDate: newStatus === '완료' && !item.completeDate ? new Date().toISOString().split('T')[0] : item.completeDate
    };
    const updatedList = vocList.map(v => v.id === item.id ? updatedItem : v);
    await saveVocData(updatedList);
  };

  // 필터링된 VOC 리스트 (본부 계정인 경우 해당 본부 건만 공유/조회)
  const filteredList = useMemo(() => {
    return vocList.filter(item => {
      // 본부 계정인 경우 해당 본부명 매칭 검사
      if (isHQStaff && userHqs.length > 0) {
        const cleanItemHq = (item.hqName || '').replace(/[\s()본부]/g, '');
        const isMatchedHq = userHqs.some(uh => cleanItemHq.includes(uh) || uh.includes(cleanItemHq));
        if (!isMatchedHq) return false;
      }

      if (statusFilter !== '전체' && item.status !== statusFilter) return false;
      if (categoryFilter !== '전체' && item.category !== categoryFilter) return false;
      if (startDateFilter && item.regDate < startDateFilter) return false;
      if (endDateFilter && item.regDate > endDateFilter) return false;
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const targetStr = `${item.customerName} ${item.phone} ${item.memNo} ${item.allMemNos} ${item.rentalNo} ${item.rentalProd} ${item.contractDate} ${item.statusB} ${item.hqName} ${item.branchName} ${item.empName} ${item.empPhone} ${item.title} ${item.content} ${item.processResult} ${item.manager}`.toLowerCase();
        if (!targetStr.includes(query)) return false;
      }
      return true;
    });
  }, [vocList, statusFilter, categoryFilter, startDateFilter, endDateFilter, searchTerm, isHQStaff, userHqs]);

  // 통계
  const stats = useMemo(() => {
    // 본부 계정인 경우 해당 본부 대상 전체 통계 산출
    const baseList = isHQStaff && userHqs.length > 0
      ? vocList.filter(item => {
          const cleanItemHq = (item.hqName || '').replace(/[\s()본부]/g, '');
          return userHqs.some(uh => cleanItemHq.includes(uh) || uh.includes(cleanItemHq));
        })
      : vocList;

    const total = baseList.length;
    const received = baseList.filter(v => v.status === '접수').length;
    const processing = baseList.filter(v => v.status === '처리중').length;
    const completed = baseList.filter(v => v.status === '완료').length;
    const pending = baseList.filter(v => v.status === '보류').length;
    return { total, received, processing, completed, pending };
  }, [vocList, isHQStaff, userHqs]);

  // 엑셀 다운로드
  const handleExportExcel = () => {
    if (filteredList.length === 0) {
      alert('다운로드할 VOC 내역이 없습니다.');
      return;
    }

    const rows = [
      ['VOC ID', '접수일자', '회원명(고객명)', '회원연락처', '선택회원번호', '보유전체회원번호목록', '렌탈번호', '렌탈상품명', '계약일자', '가입상태', '본부명', '지사명', '영업사원', '영업사원연락처', '접수유형', '처리상태', 'VOC 제목', '상세내용', '처리내용/답변', '담당자', '완료일자', '누적 코멘트 수']
    ];

    filteredList.forEach(item => {
      rows.push([
        item.id,
        item.regDate,
        item.customerName,
        item.phone,
        item.memNo || '',
        item.allMemNos || item.memNo || '',
        item.rentalNo || '',
        item.rentalProd || '',
        item.contractDate || '',
        item.statusB || '',
        item.hqName || '',
        item.branchName || '',
        item.empName || '',
        item.empPhone || '',
        item.category,
        item.status,
        item.title,
        item.content,
        item.processResult,
        item.manager,
        item.completeDate,
        item.comments ? item.comments.length : 0
      ]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'VOC대장');

    const todayStr = new Date().toISOString().substring(0, 10);
    XLSX.writeFile(wb, `VOC_관리대장_${todayStr}.xlsx`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-white w-full max-w-7xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] border border-slate-200"
      >
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-500/20">
              <MessageSquare size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">VOC (고객의 소리) 통합 관리 대장</h2>
              <p className="text-xs text-slate-400 font-medium">상품/렌탈계약번호(rentalNo) 기준으로 중복을 제거하여 상품당 딱 1건씩 깔끔하게 노출합니다.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                fetchVocData();
                fetchEmpList();
              }}
              disabled={loading}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer"
              title="새로고침"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">새로고침</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/50">
          {/* Top Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <p className="text-xs text-slate-500 font-bold">전체 접수건</p>
              <p className="text-xl font-extrabold text-slate-800 mt-1">{stats.total} <span className="text-xs font-semibold text-slate-400">건</span></p>
            </div>
            <div className="bg-blue-50/60 p-3.5 rounded-xl border border-blue-200 shadow-2xs">
              <p className="text-xs text-blue-600 font-bold flex items-center gap-1">
                <Clock size={14} /> 접수
              </p>
              <p className="text-xl font-extrabold text-blue-700 mt-1">{stats.received} <span className="text-xs font-semibold text-blue-400">건</span></p>
            </div>
            <div className="bg-purple-50/60 p-3.5 rounded-xl border border-purple-200 shadow-2xs">
              <p className="text-xs text-purple-600 font-bold flex items-center gap-1">
                <AlertCircle size={14} /> 처리중
              </p>
              <p className="text-xl font-extrabold text-purple-700 mt-1">{stats.processing} <span className="text-xs font-semibold text-purple-400">건</span></p>
            </div>
            <div className="bg-emerald-50/60 p-3.5 rounded-xl border border-emerald-200 shadow-2xs">
              <p className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                <CheckCircle2 size={14} /> 완료
              </p>
              <p className="text-xl font-extrabold text-emerald-700 mt-1">{stats.completed} <span className="text-xs font-semibold text-emerald-400">건</span></p>
            </div>
            <div className="bg-slate-100 p-3.5 rounded-xl border border-slate-300 shadow-2xs">
              <p className="text-xs text-slate-600 font-bold">보류</p>
              <p className="text-xl font-extrabold text-slate-700 mt-1">{stats.pending} <span className="text-xs font-semibold text-slate-400">건</span></p>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Left Search & Filters */}
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                <div className="relative flex-1 min-w-[220px]">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="회원명, 연락처, 회원번호, 렌탈번호, 본부, 사원, 제목 검색..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500 bg-slate-50/50"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white font-semibold text-slate-700 focus:outline-hidden cursor-pointer"
                >
                  <option value="전체">상태: 전체</option>
                  <option value="접수">접수</option>
                  <option value="처리중">처리중</option>
                  <option value="완료">완료</option>
                  <option value="보류">보류</option>
                </select>

                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white font-semibold text-slate-700 focus:outline-hidden cursor-pointer"
                >
                  <option value="전체">유형: 전체</option>
                  <option value="계약/정산">계약/정산</option>
                  <option value="배송/설치">배송/설치</option>
                  <option value="해지/환불">해지/환불</option>
                  <option value="제품/품질">제품/품질</option>
                  <option value="서비스/불친절">서비스/불친절</option>
                  <option value="기타">기타</option>
                </select>
              </div>

              {/* Right Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportExcel}
                  className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                >
                  <Download size={14} /> 엑셀 다운로드
                </button>
                <button
                  onClick={handleOpenAddForm}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-blue-500/20 cursor-pointer"
                >
                  <Plus size={16} /> VOC 신규 접수
                </button>
              </div>
            </div>
          </div>

          {/* VOC Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-600 border-b border-slate-200 font-bold uppercase tracking-wider">
                    <th className="py-3 px-3">접수일자</th>
                    <th className="py-3 px-3">회원명 / 연락처</th>
                    <th className="py-3 px-3">보유 회원번호 전체 / 렌탈번호</th>
                    <th className="py-3 px-3">계약일자 / 가입상태</th>
                    <th className="py-3 px-3">본부 / 지사</th>
                    <th className="py-3 px-3">영업사원 (연락처)</th>
                    <th className="py-3 px-3">유형</th>
                    <th className="py-3 px-3">VOC 제목 및 상품명</th>
                    <th className="py-3 px-3">처리상태</th>
                    <th className="py-3 px-3">최근 코멘트 / 처리내용</th>
                    <th className="py-3 px-3 text-center">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {loading ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400">
                        <Loader2 size={24} className="animate-spin mx-auto mb-2 text-blue-500" />
                        <p className="font-semibold">VOC 데이터를 불러오는 중입니다...</p>
                      </td>
                    </tr>
                  ) : filteredList.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400">
                        <MessageSquare size={32} className="mx-auto mb-2 text-slate-300" />
                        <p className="font-bold text-slate-500">등록된 VOC 내역이 없습니다.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredList.map(item => {
                      const commentCount = item.comments ? item.comments.length : 0;
                      const latestComment = item.comments && item.comments.length > 0 ? item.comments[item.comments.length - 1] : null;
                      const memNosDisplay = item.allMemNos || item.memNo || '-';

                      return (
                        <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                          <td className="py-3 px-3 font-mono text-slate-500 whitespace-nowrap">
                            {item.regDate}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="font-bold text-slate-800">{item.customerName}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{item.phone || '-'}</div>
                          </td>
                          <td className="py-3 px-3 max-w-[180px]">
                            <div className="text-slate-800 font-semibold text-[11px] truncate" title={memNosDisplay}>
                              {memNosDisplay}
                            </div>
                            <div className="text-blue-600 font-mono text-[11px] font-medium">{item.rentalNo || '-'}</div>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="font-mono text-[11px] text-slate-600">{item.contractDate || '-'}</div>
                            {item.statusB && (
                              <span className={`inline-block px-1.5 py-0.2 rounded-sm text-[10px] font-bold ${
                                item.statusB === '유지' ? 'bg-emerald-100 text-emerald-700' :
                                item.statusB === '해지' || item.statusB === '취소' ? 'bg-rose-100 text-rose-700' :
                                'bg-slate-100 text-slate-600'
                              }`}>
                                {item.statusB}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="font-semibold text-slate-700">{item.hqName || '-'}</div>
                            <div className="text-[11px] text-slate-400">{item.branchName || '-'}</div>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="font-bold text-slate-800">{item.empName || '-'}</div>
                            {item.empPhone ? (
                              <div className="text-[11px] text-blue-600 font-mono font-bold">📞 {item.empPhone}</div>
                            ) : (
                              <div className="text-[10px] text-slate-300">-</div>
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-bold">
                              {item.category}
                            </span>
                          </td>
                          <td className="py-3 px-3 max-w-[200px]">
                            <div className="font-bold text-slate-900 truncate" title={item.title}>
                              {item.title}
                            </div>
                            {item.rentalProd && (
                              <div className="text-[11px] text-indigo-600 font-medium truncate mt-0.5" title={item.rentalProd}>
                                📦 {item.rentalProd}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <select
                              value={item.status}
                              onChange={e => handleStatusQuickChange(item, e.target.value as any)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer focus:outline-hidden ${
                                item.status === '접수' ? 'bg-blue-50 text-blue-700 border-blue-300' :
                                item.status === '처리중' ? 'bg-purple-50 text-purple-700 border-purple-300' :
                                item.status === '완료' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' :
                                'bg-slate-100 text-slate-600 border-slate-300'
                              }`}
                            >
                              <option value="접수">접수</option>
                              <option value="처리중">처리중</option>
                              <option value="완료">완료</option>
                              <option value="보류">보류</option>
                            </select>
                          </td>
                          <td className="py-3 px-3 max-w-[220px]">
                            {latestComment ? (
                              <div>
                                <div className="text-slate-800 font-medium truncate" title={latestComment.content}>
                                  💬 {latestComment.content}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                  {latestComment.writer} · {latestComment.createdAt.substring(5, 16)}
                                </div>
                              </div>
                            ) : item.processResult ? (
                              <div className="truncate text-slate-700" title={item.processResult}>
                                {item.processResult}
                              </div>
                            ) : (
                              <span className="text-slate-300 italic text-[11px]">기록 없음</span>
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleOpenEditForm(item)}
                                className="px-2 py-1 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded-md font-bold text-[11px] transition-colors flex items-center gap-1 cursor-pointer"
                                title="상세 및 코멘트 달기"
                              >
                                <Edit3 size={13} />
                                <span>상세/코멘트</span>
                                {commentCount > 0 && (
                                  <span className="px-1.5 py-0.2 bg-blue-600 text-white text-[10px] font-black rounded-full">
                                    {commentCount}
                                  </span>
                                )}
                              </button>
                              <button
                                onClick={() => handleDelete(item.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                                title="삭제"
                              >
                                <Trash2 size={15} />
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
          </div>
        </div>
      </motion.div>

      {/* Add / Edit & Comments Form Sub-Dialog */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/75 p-3 sm:p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]"
            >
              {/* Form Modal Header */}
              <div className="bg-slate-900 text-white px-6 py-3.5 flex items-center justify-between shrink-0">
                <h3 className="text-base font-bold flex items-center gap-2">
                  <MessageSquare size={18} className="text-blue-400" />
                  {editingId ? 'VOC 상세 정보 & 경과 코멘트' : '신규 VOC 접수 등록'}
                </h3>
                <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
                {/* 1. 회원 검색 Autocomplete 영역 */}
                <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-200/80 space-y-3 relative">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-blue-900 flex items-center gap-1.5 text-xs">
                      <Search size={14} className="text-blue-600" />
                      회원 검색 (상품/렌탈계약번호 기준 중복제거 유일 노출)
                    </label>
                    <span className="text-[11px] text-blue-600 font-semibold">이름, 연락처, 계약일자, 렌탈계약번호, 본부명, 지사명, 영업자명 표기</span>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      value={searchMemberQuery}
                      onChange={e => {
                        setSearchMemberQuery(e.target.value);
                        setShowMemberDropdown(true);
                      }}
                      onFocus={() => setShowMemberDropdown(true)}
                      placeholder="회원 성함, 연락처, 렌탈계약번호 입력..."
                      className="w-full pl-3 pr-8 py-2.5 bg-white border border-blue-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500 shadow-2xs"
                    />
                    {searchMemberQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchMemberQuery('');
                          setShowMemberDropdown(false);
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X size={14} />
                      </button>
                    )}

                    {/* 추천 드롭다운 (상품/렌탈계약번호 기준 유일 노출) */}
                    {showMemberDropdown && matchedMembers.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-blue-200 rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto divide-y divide-slate-100">
                        {matchedMembers.map((m, idx) => (
                          <div
                            key={idx}
                            onClick={() => handleSelectMember(m)}
                            className="p-3 hover:bg-blue-50 transition-colors cursor-pointer flex flex-col gap-1.5 text-slate-800"
                          >
                            <div className="flex items-center justify-between font-bold text-xs">
                              <span className="text-blue-700 font-extrabold text-sm">👤 {m.memName} <span className="text-xs text-slate-500 font-mono font-normal">({m.phone})</span></span>
                              <span className="text-slate-500 text-[11px] font-mono">📅 계약일: <strong className="text-slate-700">{m.contractDate || '-'}</strong></span>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 bg-slate-50/70 p-2 rounded-lg border border-slate-100">
                              <div>🔑 렌탈계약번호: <strong className="text-blue-600 font-mono">{m.rentalNo || '-'}</strong></div>
                              <div>🏢 <strong className="text-slate-800">{m.hq}</strong> / <span className="text-slate-600">{m.branch}</span></div>
                              <div>👔 영업자명: <strong className="text-slate-800">{m.empName || '-'}</strong></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 11가지 상세 정보 시원하고 깔끔한 그리드 카드 UI */}
                  {(formCustomerName || formPhone || formRentalNo) && (
                    <div className="bg-white p-3.5 rounded-xl border border-blue-200/90 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between pb-2 border-b border-blue-100">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                          <CheckCircle2 size={15} className="text-blue-600" />
                          선택 회원의 상세 연동 결과
                        </span>
                        <span className="text-[11px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-md">
                          가입상태: {formStatusB || '확인됨'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                          <span className="text-slate-400 font-medium block text-[10px]">1. 회원명 / 2. 연락처</span>
                          <strong className="text-slate-800 text-xs">{formCustomerName}</strong> <span className="text-slate-500 font-mono text-[11px]">({formPhone})</span>
                        </div>

                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 col-span-2">
                          <span className="text-slate-400 font-medium block text-[10px]">3. 보유 회원번호 전체 목록</span>
                          <strong className="text-blue-700 font-mono text-xs">{formAllMemNos || formMemNo || '-'}</strong>
                        </div>

                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                          <span className="text-slate-400 font-medium block text-[10px]">4. 선택 렌탈계약번호</span>
                          <strong className="text-blue-600 font-mono text-xs">{formRentalNo || '-'}</strong>
                        </div>

                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                          <span className="text-slate-400 font-medium block text-[10px]">5. 렌탈 상품명</span>
                          <strong className="text-slate-800 text-xs truncate block" title={formRentalProd}>{formRentalProd || '-'}</strong>
                        </div>

                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                          <span className="text-slate-400 font-medium block text-[10px]">6. 계약일자 / 7. 가입상태</span>
                          <strong className="text-slate-800 font-mono text-xs">{formContractDate || '-'}</strong> <span className="text-emerald-600 font-bold">({formStatusB || '-'})</span>
                        </div>

                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                          <span className="text-slate-400 font-medium block text-[10px]">8. 본부명 / 9. 지사명</span>
                          <strong className="text-slate-800 text-xs">{formHqName || '-'}</strong> <span className="text-slate-500">/ {formBranchName || '-'}</span>
                        </div>

                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 col-span-2">
                          <span className="text-slate-400 font-medium block text-[10px]">10. 영업사원 / 11. 영업사원 연락처 (사원리스트 L열)</span>
                          <strong className="text-slate-800 text-xs">{formEmpName || '-'}</strong> {formEmpPhone ? <span className="text-blue-600 font-mono text-[11px] ml-1 font-bold">📞 {formEmpPhone}</span> : <span className="text-slate-400 ml-1">(연락처 없음)</span>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. VOC 본문 및 기본 정보 입력 폼 */}
                <form id="vocMainForm" onSubmit={handleFormSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">접수일자 *</label>
                      <input
                        type="date"
                        value={formRegDate}
                        onChange={e => setFormRegDate(e.target.value)}
                        required
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:outline-hidden focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">접수유형</label>
                      <select
                        value={formCategory}
                        onChange={e => setFormCategory(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-hidden focus:border-blue-500 cursor-pointer"
                      >
                        <option value="계약/정산">계약/정산</option>
                        <option value="배송/설치">배송/설치</option>
                        <option value="해지/환불">해지/환불</option>
                        <option value="제품/품질">제품/품질</option>
                        <option value="서비스/불친절">서비스/불친절</option>
                        <option value="기타">기타</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">처리상태</label>
                      <select
                        value={formStatus}
                        onChange={e => setFormStatus(e.target.value as any)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold focus:outline-hidden focus:border-blue-500 cursor-pointer"
                      >
                        <option value="접수">접수</option>
                        <option value="처리중">처리중</option>
                        <option value="완료">완료</option>
                        <option value="보류">보류</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">VOC 제목 *</label>
                    <input
                      type="text"
                      value={formTitle}
                      onChange={e => setFormTitle(e.target.value)}
                      placeholder="VOC 요약 제목을 입력하세요."
                      required
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold focus:outline-hidden focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">상세 내용 (접수 내용)</label>
                    <textarea
                      rows={3}
                      value={formContent}
                      onChange={e => setFormContent(e.target.value)}
                      placeholder="고객이 제기한 VOC 상세내용을 입력하세요."
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:border-blue-500 resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">담당자</label>
                      <input
                        type="text"
                        value={formManager}
                        onChange={e => setFormManager(e.target.value)}
                        placeholder="처리 담당자 성함"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">완료일자</label>
                      <input
                        type="date"
                        value={formCompleteDate}
                        onChange={e => setFormCompleteDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:outline-hidden focus:border-blue-500"
                      />
                    </div>
                  </div>
                </form>

                {/* 3. 코멘트 타임라인 (누적 경과 기록) 영역 */}
                <div className="pt-4 border-t border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                      <MessageSquare size={15} className="text-blue-600" />
                      누적 상담 / 처리 경과 코멘트 타임라인 ({comments.length}건)
                    </h4>
                    <span className="text-[11px] text-slate-400">일시와 작성자가 함께 자동 저장됩니다.</span>
                  </div>

                  {/* 신규 코멘트 등록 창 */}
                  <div className="p-3 bg-slate-100/90 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newCommentWriter}
                        onChange={e => setNewCommentWriter(e.target.value)}
                        placeholder="작성자명 (기본: 담당자)"
                        className="w-36 px-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-xs focus:outline-hidden focus:border-blue-500"
                      />
                      <input
                        type="text"
                        value={newCommentText}
                        onChange={e => setNewCommentText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleAddComment();
                          }
                        }}
                        placeholder="새로운 경과 내용 또는 코멘트를 입력하세요..."
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs focus:outline-hidden focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddComment}
                        className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-md font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                      >
                        <Send size={13} /> 코멘트 추가
                      </button>
                    </div>
                  </div>

                  {/* 코멘트 목록 타임라인 */}
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {comments.length === 0 ? (
                      <div className="py-6 text-center text-slate-400 italic text-[11px] bg-slate-50 rounded-lg border border-dashed border-slate-200">
                        아직 추가된 코멘트 경과가 없습니다. 위 입력창에서 코멘트를 등록해 보세요.
                      </div>
                    ) : (
                      comments.map((cmt, idx) => (
                        <div key={cmt.id || idx} className="p-3 bg-white border border-slate-200/90 rounded-xl shadow-2xs flex flex-col gap-1 relative group">
                          <div className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                                👤 {cmt.writer}
                              </span>
                              <span className="text-slate-400 font-mono">{cmt.createdAt}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteComment(cmt.id)}
                              className="text-slate-300 hover:text-rose-600 transition-colors p-1"
                              title="코멘트 삭제"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                          <p className="text-xs text-slate-800 leading-relaxed font-medium pl-1 pt-0.5 whitespace-pre-wrap">
                            {cmt.content}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Form Modal Footer */}
              <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
                <div className="text-[11px] text-slate-500 font-medium">
                  * 저장 버튼을 누르면 모든 VOC 상세정보 및 누적 코멘트가 구글 시트에 실시간 반영됩니다.
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer text-xs"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    form="vocMainForm"
                    disabled={saving}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md shadow-blue-500/20 flex items-center gap-1.5 transition-colors cursor-pointer text-xs"
                  >
                    {saving && <Loader2 size={14} className="animate-spin" />}
                    <span>{editingId ? '전체 VOC & 코멘트 저장' : 'VOC 신규 등록 저장'}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

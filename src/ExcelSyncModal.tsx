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
  Info
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

  const [deliveryFile, setDeliveryFile] = useState<File | null>(null);
  const [deliveryRows, setDeliveryRows] = useState<any[][] | null>(null);
  const [deliveryFileName, setDeliveryFileName] = useState<string>('');

  const [autoBackup, setAutoBackup] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingText, setLoadingText] = useState<string>('');

  const [previewStats, setPreviewStats] = useState<SyncStats | null>(null);
  const [completedResult, setCompletedResult] = useState<{ backupTitle?: string; stats: SyncStats } | null>(null);

  const contractInputRef = useRef<HTMLInputElement>(null);
  const deliveryInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // 엑셀 파일 파싱 헬퍼 (window.XLSX 사용)
  const parseExcelFile = async (file: File): Promise<any[][]> => {
    const XLSX = (window as any).XLSX;
    if (!XLSX) throw new Error('XLSX 라이브러리를 불러올 수 없습니다. 페이지를 새로고침해 주세요.');

    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });
    return jsonRows as any[][];
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

  // 배송데이터 파일 선택 핸들러
  const handleDeliveryFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsLoading(true);
      setLoadingText('배송데이터 엑셀을 읽고 분석하는 중...');
      const rows = await parseExcelFile(file);
      if (!rows || rows.length < 2) {
        alert('엑셀에 데이터가 없거나 올바른 형식이 아닙니다.');
        return;
      }
      setDeliveryFile(file);
      setDeliveryFileName(file.name);
      setDeliveryRows(rows);
      setPreviewStats(null);
      setCompletedResult(null);
    } catch (err: any) {
      console.error(err);
      alert('파일을 읽는 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setIsLoading(false);
      if (deliveryInputRef.current) deliveryInputRef.current.value = '';
    }
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
        stats: data.stats
      });

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
    setDeliveryFile(null);
    setDeliveryRows(null);
    setDeliveryFileName('');
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
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-2xl border border-indigo-400/30 flex items-center justify-center shadow-inner">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black tracking-tight">전산 엑셀 직접 업로드 & 관리대장 동기화</h3>
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold rounded-full border border-emerald-400/30">
                  수기 수정 100% 보존
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                전산에서 다운로드한 엑셀을 올리면, 기존 스크립트와 동일한 공식으로 관리대장을 완벽하게 생성/동기화합니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="닫기"
          >
            <X size={20} />
          </button>
        </div>

        {/* 바디 컨텐츠 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 1. 핵심 안전 안내 바 */}
          <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100/80 flex items-start gap-3 text-xs text-indigo-950">
            <ShieldCheck size={20} className="text-indigo-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-black text-[13px] text-indigo-900 block">
                🛡️ 데이터 유실 및 엉킴 방지 4대 안전장치 가동 중
              </span>
              <p className="text-[11px] text-indigo-800 leading-relaxed">
                ① <strong>수기 수정 데이터 100% 영구 보존</strong>: 기존 관리대장의 실시간 계약상태(해약/취소 등 B열) 및 선지급일자(23일 등 O열), 배송메모는 절대 덮어써지지 않습니다.<br />
                ② <strong>자동 백업</strong>: 동기화 직전 <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-indigo-200">백업_관리대장_날짜</span> 시트를 자동 생성하여 언제든 1초 만에 롤백 가능합니다.<br />
                ③ <strong>비동기 업로드</strong>: 계약원장만 올리기, 배송데이터만 올리기, 둘 다 한 번에 올리기가 모두 가능합니다.
              </p>
            </div>
          </div>

          {/* 2. 파일 업로드 2단 그리드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 2-A. 계약원장 엑셀 업로드 카드 */}
            <div className={`p-5 rounded-2xl border-2 transition-all flex flex-col justify-between ${
              contractRows ? 'bg-emerald-50/40 border-emerald-300' : 'bg-slate-50/60 border-dashed border-slate-300 hover:border-indigo-400'
            }`}>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-xl ${contractRows ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-700'}`}>
                      <FileText size={18} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-800">1. 계약 원장 엑셀</h4>
                      <span className="text-[11px] text-slate-400">기존 '시트1' 대체 (회원/상품/조직 등)</span>
                    </div>
                  </div>
                  {contractRows && (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-black rounded-lg border border-emerald-200">
                      총 {contractRows.length - 1}건 준비됨
                    </span>
                  )}
                </div>

                {contractRows ? (
                  <div className="p-3 bg-white rounded-xl border border-emerald-200 text-xs space-y-1 mb-3 shadow-2xs">
                    <div className="font-bold text-slate-800 truncate flex items-center gap-1.5">
                      <CheckCircle size={14} className="text-emerald-500 shrink-0" />
                      <span className="truncate">{contractFileName}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center justify-between">
                      <span>행 수: {contractRows.length.toLocaleString()}행</span>
                      <span className="text-emerald-600 font-bold">헬스케어 PQR 분배 대기</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    전산에서 다운로드한 계약 원장 파일(.xlsx)을 업로드하면 신규 회원을 자동 등록하고 조직 정보를 최신화합니다.
                  </p>
                )}
              </div>

              <div>
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
                    className="flex-1 py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Upload size={14} />
                    {contractRows ? '파일 다시 선택' : '계약원장 파일 선택'}
                  </button>
                  {contractRows && (
                    <button
                      type="button"
                      onClick={() => { setContractFile(null); setContractRows(null); setContractFileName(''); setPreviewStats(null); }}
                      className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      취소
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 2-B. 배송데이터 엑셀 업로드 카드 */}
            <div className={`p-5 rounded-2xl border-2 transition-all flex flex-col justify-between ${
              deliveryRows ? 'bg-blue-50/40 border-blue-300' : 'bg-slate-50/60 border-dashed border-slate-300 hover:border-blue-400'
            }`}>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-xl ${deliveryRows ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-700'}`}>
                      <Truck size={18} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-800">2. 배송데이터 엑셀</h4>
                      <span className="text-[11px] text-slate-400">기존 '배송데이터' 대체 (배송/개통/해지 등)</span>
                    </div>
                  </div>
                  {deliveryRows && (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[11px] font-black rounded-lg border border-blue-200">
                      총 {deliveryRows.length - 1}건 준비됨
                    </span>
                  )}
                </div>

                {deliveryRows ? (
                  <div className="p-3 bg-white rounded-xl border border-blue-200 text-xs space-y-1 mb-3 shadow-2xs">
                    <div className="font-bold text-slate-800 truncate flex items-center gap-1.5">
                      <CheckCircle size={14} className="text-blue-500 shrink-0" />
                      <span className="truncate">{deliveryFileName}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center justify-between">
                      <span>행 수: {deliveryRows.length.toLocaleString()}행</span>
                      <span className="text-blue-600 font-bold">익월 20일/25일 수수료 계산 대기</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    배송 및 개통 현황 파일(.xlsx)을 업로드하면 렌탈계약번호를 매칭하여 배송완료, 예정일, 해지일 및 수수료지급일자를 갱신합니다.
                  </p>
                )}
              </div>

              <div>
                <input
                  type="file"
                  ref={deliveryInputRef}
                  accept=".xlsx, .xls, .csv"
                  onChange={handleDeliveryFileChange}
                  className="hidden"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => deliveryInputRef.current?.click()}
                    disabled={isLoading}
                    className="flex-1 py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Upload size={14} />
                    {deliveryRows ? '파일 다시 선택' : '배송데이터 파일 선택'}
                  </button>
                  {deliveryRows && (
                    <button
                      type="button"
                      onClick={() => { setDeliveryFile(null); setDeliveryRows(null); setDeliveryFileName(''); setPreviewStats(null); }}
                      className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      취소
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 3. 옵션 바 */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoBackup}
                onChange={e => setAutoBackup(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span>반영 직전 구글 시트 자동 백업 탭 생성 (적극 권장)</span>
            </label>
            {(contractRows || deliveryRows) && (
              <button
                type="button"
                onClick={handleReset}
                className="text-slate-400 hover:text-rose-600 font-bold transition-colors"
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
                총 <strong>{completedResult.stats.finalTotalCount}건</strong>의 데이터가 구글 시트 [관리대장]에 최신화되었으며, ERP 웹사이트 화면 데이터도 자동으로 새로고침되었습니다.
              </p>
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
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <Info size={14} />
            <span>반영 후에도 언제든 구글 시트의 백업 탭을 통해 원클릭 롤백할 수 있습니다.</span>
          </div>

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

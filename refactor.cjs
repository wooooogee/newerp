const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

// 1. default applyOverriding false
content = content.replace('applyOverriding: true,', 'applyOverriding: false,');

// 2. Delete Overriding Configuration at bottom
content = content.replace(/\{\/\* Overriding Configuration \*\/\}.*?<\/div>\s*<\/div>\s*<\/div>\s*\);\s*\}\)\(\)\s*\}/s, '</div></div></div>);\n                                    })()\n                                  }');

// 3. Update table row loop to add React.Fragment
content = content.replace('{s.productRules.map((pr, pIdx) => (\n                                      <tr key={pIdx} className="hover:bg-slate-50 transition-colors">', '{s.productRules.map((pr, pIdx) => (\n                                      <React.Fragment key={pIdx}>\n                                      <tr className="hover:bg-slate-50 transition-colors">');

// 4. Remove small overriding grid and simplify checkbox
const td_target = `<td className="px-4 py-3 text-center align-top">
                                          <div className="flex flex-col items-center gap-2">
                                            <input type="checkbox" checked={pr.applyOverriding !== false} onChange={(e) => {
                                              const updated = s.productRules.map((r, i) => i === pIdx ? { ...r, applyOverriding: e.target.checked } : r);
                                              setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, productRules: updated } : h));
                                            }} className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
                                            {pr.applyOverriding !== false && (
                                              <div className="grid grid-cols-2 gap-1 text-[9px] mt-1">
                                                {['salesperson', 'teamLeader', 'branchManager', 'hqManager'].map((role, rIdx) => {
                                                  const roleLabels = ['영업', '팀장', '지사', '본부'];
                                                  const currOv = pr.overriding || s.overriding || { salesperson: 0, teamLeader: 0, branchManager: 0, hqManager: 0 };
                                                  return (
                                                    <div key={role} className="flex flex-col items-center gap-0.5">
                                                      <span className="text-[8px] text-slate-400">{roleLabels[rIdx]}</span>
                                                      <input
                                                        type="number"
                                                        value={(currOv as any)[role]}
                                                        onChange={(e) => {
                                                          const val = parseInt(e.target.value) || 0;
                                                          const updated = s.productRules.map((r, i) => {
                                                            if (i !== pIdx) return r;
                                                            const newOv = { ...(r.overriding || s.overriding || { salesperson: 0, teamLeader: 0, branchManager: 0, hqManager: 0 }) };
                                                            (newOv as any)[role] = val;
                                                            return { ...r, overriding: newOv };
                                                          });
                                                          setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, productRules: updated } : h));
                                                        }}
                                                        className="w-12 px-1 py-0.5 text-center border border-slate-200 rounded"
                                                      />
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        </td>`;

const new_td = `<td className="px-4 py-3 text-center align-top">
                                          <input type="checkbox" checked={pr.applyOverriding === true} onChange={(e) => {
                                            const updated = s.productRules.map((r, i) => i === pIdx ? { ...r, applyOverriding: e.target.checked } : r);
                                            setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, productRules: updated } : h));
                                          }} className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 mt-2" />
                                        </td>`;

content = content.replace(td_target, new_td);

// 5. Add expanded row
const end_tr_target = `</button>
                                        </td>
                                      </tr>
                                    ))}`;

const new_end_tr = `</button>
                                        </td>
                                      </tr>
                                      {pr.applyOverriding === true && (
                                        <tr className="bg-indigo-50/40 border-b border-indigo-100">
                                          <td colSpan={7} className="px-6 py-4">
                                            <div className="flex flex-col gap-2">
                                              <h6 className="text-[11px] font-black text-indigo-800 flex items-center gap-1.5"><Users size={12} /> {pr.productName} 오버라이딩 배분 구조 (고정금액)</h6>
                                              <div className="grid grid-cols-4 gap-4 mt-2">
                                                {[
                                                  { key: 'salesperson', label: '영업사원' },
                                                  { key: 'teamLeader', label: '팀장' },
                                                  { key: 'branchManager', label: '지점장' },
                                                  { key: 'hqManager', label: '본부장' }
                                                ].map(f => {
                                                  const currOv = pr.overriding || { salesperson: 0, teamLeader: 0, branchManager: 0, hqManager: 0 };
                                                  return (
                                                    <div key={f.key} className="flex flex-col gap-1">
                                                      <label className="text-[10px] font-bold text-indigo-400">
                                                        {f.label} (₩)
                                                      </label>
                                                      <input
                                                        type="number" value={(currOv as any)[f.key]}
                                                        onChange={(e) => {
                                                          const val = parseInt(e.target.value) || 0;
                                                          const updated = s.productRules.map((r, i) => {
                                                            if (i !== pIdx) return r;
                                                            const newOv = { ...(r.overriding || { salesperson: 0, teamLeader: 0, branchManager: 0, hqManager: 0 }) };
                                                            (newOv as any)[f.key] = val;
                                                            return { ...r, overriding: newOv };
                                                          });
                                                          setHqSettings(hqSettings.map(h => h.id === s.id ? { ...h, productRules: updated } : h));
                                                        }}
                                                        className="p-2 bg-white border border-indigo-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-300 transition-all"
                                                      />
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                      </React.Fragment>
                                    ))}`;

content = content.replace(end_tr_target, new_end_tr);

// 6. Replace actualOv calculations in 3 places
// 6a. exportCommissionToExcel
const calc1 = `        const isProductOvApplied = productRule ? productRule.applyOverriding !== false : true;
        const defaultOv = setting?.overriding || { salesperson: 0, teamLeader: 0, branchManager: 0, hqManager: 0 };
        const ov = (isProductOvApplied && productRule?.overriding) ? productRule.overriding : defaultOv;
        const actualOv = (setting?.enableOverriding && isProductOvApplied) ? ov : { salesperson: totalCommission, teamLeader: 0, branchManager: 0, hqManager: 0 };`;

const new_calc1 = `        const isProductOvApplied = productRule ? productRule.applyOverriding === true : false;
        const actualOv = (isProductOvApplied && productRule?.overriding) 
          ? productRule.overriding 
          : { salesperson: totalCommission, teamLeader: 0, branchManager: 0, hqManager: 0 };`;

content = content.replace(calc1, new_calc1);

// 6b. Detailed report logic
const calc2 = `      // --- 오버라이딩 대상 여부 확인 및 요약 행 구성 ---
      if (setting?.enableOverriding || hqName === '다이렉트') {
        rows[2] = ['지급일자', '성명', '역할', '은행', '계좌번호', '예금주', '지급액(실지급)'];
        
        // 사원별 집계 (해당 본부만)
        const empMap = new Map<string, any>();
        items.forEach(item => {
          if (item.status.includes('취소')) return;
          const { totalCommission, productRule } = calculateCommissionDetails(item, stats);
          const isProductOvApplied = productRule ? productRule.applyOverriding !== false : true;
          const defaultOv = setting?.overriding || { salesperson: totalCommission, teamLeader: 0, branchManager: 0, hqManager: 0 };
          const ov = (isProductOvApplied && productRule?.overriding) ? productRule.overriding : defaultOv;
          let shares = { '영업사원': 0, '팀장': 0, '지점장': 0, '본부장': 0 };
          
          if (setting?.enableOverriding && isProductOvApplied) {
            shares['영업사원'] = ov.salesperson;
            shares['팀장'] = ov.teamLeader;
            shares['지점장'] = ov.branchManager;
            shares['본부장'] = ov.hqManager;
          } else {
            shares['영업사원'] = totalCommission;
            shares['팀장'] = 0;
            shares['지점장'] = 0;
            shares['본부장'] = 0;
          }`;

const new_calc2 = `      // --- 오버라이딩 대상 여부 확인 및 요약 행 구성 ---
      rows[2] = ['지급일자', '성명', '역할', '은행', '계좌번호', '예금주', '지급액(실지급)'];
      
      // 사원별 집계 (해당 본부만)
      const empMap = new Map<string, any>();
      items.forEach(item => {
        if (item.status.includes('취소')) return;
        const { totalCommission, productRule } = calculateCommissionDetails(item, stats);
        const isProductOvApplied = productRule ? productRule.applyOverriding === true : false;
        const ov = (isProductOvApplied && productRule?.overriding) 
          ? productRule.overriding 
          : { salesperson: totalCommission, teamLeader: 0, branchManager: 0, hqManager: 0 };
          
        let shares = {
          '영업사원': ov.salesperson,
          '팀장': ov.teamLeader,
          '지점장': ov.branchManager,
          '본부장': ov.hqManager
        };`;

content = content.replace(calc2, new_calc2);

const closing_target = `        empMap.forEach((data) => {
          if (data.total <= 0) return;
          const user = getUserInfo(data.name);
          rows.push([
            payDateDisplay,
            data.name,
            data.role,
            user.bankName,
            user.accountNum,
            user.accountHolder,
            data.total
          ]);
        });
      } else {
        rows[2] = ['지급일자', '지사명', '은행', '계좌번호', '예금주', '총지급 금액'];
        rows[3] = [
          payDateDisplay,
          hqName,
          setting?.bankName || '-',
          setting?.accountNumber || '-',
          setting?.accountHolder || '-',
          { v: totalSum, t: 'n', z: '#,##0' }
        ];
      }`;

const new_closing = `        empMap.forEach((data) => {
          if (data.total <= 0) return;
          const user = getUserInfo(data.name);
          rows.push([
            payDateDisplay,
            data.name,
            data.role,
            user.bankName,
            user.accountNum,
            user.accountHolder,
            data.total
          ]);
        });`;

content = content.replace(closing_target, new_closing);

// 6c. List API
const calc3 = `        const isProductOvApplied = productRule ? productRule.applyOverriding !== false : true;
        if (setting?.enableOverriding || item.hq === '다이렉트') {
          const defaultOv = setting?.overriding || { salesperson: totalCommission, teamLeader: 0, branchManager: 0, hqManager: 0 };
          const ov = (isProductOvApplied && productRule?.overriding) ? productRule.overriding : defaultOv;
          let sh = { sp: totalCommission, tl: 0, bm: 0, hm: 0 };
          if (setting?.enableOverriding && isProductOvApplied) {
            sh.sp = ov.salesperson; sh.tl = ov.teamLeader; sh.bm = ov.branchManager; sh.hm = ov.hqManager;
          }
          const isIndiv = setting?.settlementType?.includes('개인') || item.hq === '글로씨';
          const calcNet = (amt: number) => isIndiv ? amt - Math.floor(amt * 0.033) : amt;
          const org = directOrgMap.get(item.empName) || { teamLeader: '', branchManager: '', hqManager: '' };
          const add = (name: string, role: string, amount: number) => {
            if (amount <= 0 || !name) return;
            const netAmount = calcNet(amount);
            const key = \`\${item.hq}|\${item.branch || '-'}|\${name}|\${role}\`;
            if (!hqEmpSummaryMap.has(key)) hqEmpSummaryMap.set(key, { hq: item.hq, branch: role === '영업사원' ? (item.branch || '-') : '-', empName: name, role, total: 0 });
            hqEmpSummaryMap.get(key).total += netAmount;
          };
          add(item.empName, '영업사원', sh.sp); add(org.teamLeader, '팀장', sh.tl); add(org.branchManager, '지점장', sh.bm); add(org.hqManager, '본부장', sh.hm);
        } else {
          // 기존 코드 유지...
          const isIndiv = setting?.settlementType?.includes('개인') || item.hq === '글로씨';
          const netSp = isIndiv ? finalPayable : totalCommission;
          
          let exRow = reportRows.find(r => r[0] === item.hq && r[1] === item.prodName);
          if (!exRow) {
            exRow = [item.hq, item.prodName, netSp, 0, 0];
            reportRows.push(exRow);
          }
          exRow[3]++;
          exRow[4] += netSp;
          totalSum += netSp;
        }`;

const new_calc3 = `        const isProductOvApplied = productRule ? productRule.applyOverriding === true : false;
        const actualOv = (isProductOvApplied && productRule?.overriding) 
          ? productRule.overriding 
          : { salesperson: totalCommission, teamLeader: 0, branchManager: 0, hqManager: 0 };
        let sh = { sp: actualOv.salesperson, tl: actualOv.teamLeader, bm: actualOv.branchManager, hm: actualOv.hqManager };

        const isIndiv = setting?.settlementType?.includes('개인') || item.hq === '글로씨';
        const calcNet = (amt: number) => isIndiv ? amt - Math.floor(amt * 0.033) : amt;
        const org = directOrgMap.get(item.empName) || { teamLeader: '', branchManager: '', hqManager: '' };
        const add = (name: string, role: string, amount: number) => {
          if (amount <= 0 || !name) return;
          const netAmount = calcNet(amount);
          const key = \`\${item.hq}|\${item.branch || '-'}|\${name}|\${role}\`;
          if (!hqEmpSummaryMap.has(key)) hqEmpSummaryMap.set(key, { hq: item.hq, branch: role === '영업사원' ? (item.branch || '-') : '-', empName: name, role, total: 0 });
          hqEmpSummaryMap.get(key).total += netAmount;
        };
        add(item.empName, '영업사원', sh.sp); add(org.teamLeader, '팀장', sh.tl); add(org.branchManager, '지점장', sh.bm); add(org.hqManager, '본부장', sh.hm);`;

content = content.replace(calc3, new_calc3);

fs.writeFileSync('src/App.tsx', content, 'utf8');
console.log('Done!');

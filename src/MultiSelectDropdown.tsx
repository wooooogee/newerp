import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface MultiSelectDropdownProps {
  label: string;
  options: string[];
  selectedOptions: string[];
  onChange: (selected: string[]) => void;
}

export const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({ label, options, selectedOptions, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = (option: string) => {
    if (selectedOptions.includes(option)) {
      onChange(selectedOptions.filter(o => o !== option));
    } else {
      onChange([...selectedOptions, option]);
    }
  };

  const isAllSelected = selectedOptions.length === 0;

  const handleToggleAll = () => {
    onChange([]); // Setting to empty array means '전체'
  };

  const displayValue = isAllSelected 
    ? '전체' 
    : selectedOptions.length === 1 
      ? selectedOptions[0] 
      : `${selectedOptions[0]} 외 ${selectedOptions.length - 1}건`;

  return (
    <div className="relative flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors" ref={dropdownRef} onClick={() => setIsOpen(!isOpen)}>
      <span className="text-[11px] font-bold text-slate-400 shrink-0">{label}</span>
      <div className="flex items-center justify-between min-w-[60px] max-w-[120px]">
        <span className="text-[12px] font-bold text-slate-700 truncate">{displayValue}</span>
        <ChevronDown size={14} className={`text-slate-400 ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-slate-200 shadow-xl rounded-xl z-50 max-h-60 overflow-y-auto py-1" onClick={e => e.stopPropagation()}>
          <div 
            className="flex items-center px-3 py-2.5 hover:bg-slate-50 cursor-pointer border-b border-slate-100"
            onClick={handleToggleAll}
          >
            <div className={`w-4 h-4 rounded border flex items-center justify-center mr-2 ${isAllSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
              {isAllSelected && <Check size={12} className="text-white" strokeWidth={3} />}
            </div>
            <span className={`text-[12px] ${isAllSelected ? 'font-black text-blue-700' : 'font-bold text-slate-700'}`}>전체</span>
          </div>
          {options.map(option => {
            const isSelected = selectedOptions.includes(option);
            return (
              <div 
                key={option}
                className="flex items-center px-3 py-2 hover:bg-slate-50 cursor-pointer"
                onClick={() => handleToggle(option)}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center mr-2 ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                  {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
                </div>
                <span className={`text-[12px] ${isSelected ? 'font-bold text-blue-700' : 'font-medium text-slate-700'} truncate`}>{option}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

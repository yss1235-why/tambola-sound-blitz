// src/components/NumberGrid.tsx - Simplified without instructional text
import React from 'react';

interface NumberGridProps {
  calledNumbers: number[];
  currentNumber: number | null;
  isHost?: boolean;
  onNumberClick?: (number: number) => void;
}

export const NumberGrid: React.FC<NumberGridProps> = ({ 
  calledNumbers, 
  currentNumber, 
  isHost = false,
  onNumberClick 
}) => {
  const numbers = Array.from({ length: 90 }, (_, i) => i + 1);

  const getNumberStyle = (number: number) => {
    const isCalled = calledNumbers.includes(number);
    const isCurrent = currentNumber === number;
    
    let baseClass = 'number-cell transition-all duration-300 cursor-pointer hover:scale-105 flex items-center justify-center rounded-xl font-bold text-sm border-2';
    
    if (isCurrent) {
      return `${baseClass} current bg-gradient-to-br from-yellow-400 to-yellow-600 text-white shadow-xl transform scale-110 ring-4 ring-yellow-300 ring-opacity-50 animate-pulse`;
    }
    
    if (isCalled) {
      return `${baseClass} called bg-gradient-to-br from-emerald-400 to-emerald-500 text-white shadow-lg border-emerald-400`;
    }
    
    return `${baseClass} bg-gradient-to-br from-slate-100 to-slate-200 text-slate-800 border-slate-300 hover:border-slate-400 hover:from-slate-200 hover:to-slate-300`;
  };

  const handleNumberClick = (number: number) => {
    if (isHost && onNumberClick) {
      onNumberClick(number);
    }
  };

  const getNumberDisplayClass = (number: number) => {
    const isCalled = calledNumbers.includes(number);
    const isCurrent = currentNumber === number;
    
    if (isCurrent) {
      return 'text-2xl font-black';
    }
    
    if (isCalled) {
      return 'text-lg font-bold';
    }
    
    return 'text-base font-semibold';
  };

  // Organize numbers in rows of 10 for better display
  const numberRows = [];
  for (let i = 0; i < numbers.length; i += 10) {
    numberRows.push(numbers.slice(i, i + 10));
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      {/* Header */}
      <div className="mb-4 text-center">
        <div className="flex justify-center space-x-4 text-sm text-gray-600">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-300 rounded"></div>
            <span>Available</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-gradient-to-br from-emerald-400 to-emerald-500 rounded"></div>
            <span>Called</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded"></div>
            <span>Current</span>
          </div>
        </div>
      </div>

      {/* Number Grid */}
      <div className="space-y-2">
        {numberRows.map((row, rowIndex) => (
          <div key={rowIndex} className="grid grid-cols-10 gap-2">
            {row.map((number) => (
              <div
                key={number}
                className={getNumberStyle(number)}
                onClick={() => handleNumberClick(number)}
                style={{ aspectRatio: '1' }}
                title={`Number ${number}${calledNumbers.includes(number) ? ' - Called' : ''}${currentNumber === number ? ' - Current' : ''}`}
              >
                <span className={getNumberDisplayClass(number)}>
                  {number}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Statistics */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="text-2xl font-bold text-blue-600">{calledNumbers.length}</div>
          <div className="text-sm text-blue-700">Numbers Called</div>
        </div>
        <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
          <div className="text-2xl font-bold text-green-600">{90 - calledNumbers.length}</div>
          <div className="text-sm text-green-700">Numbers Remaining</div>
        </div>
        <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-200">
          <div className="text-2xl font-bold text-purple-600">
            {Math.round((calledNumbers.length / 90) * 100)}%
          </div>
          <div className="text-sm text-purple-700">Game Progress</div>
        </div>
      </div>

      {/* Host Instructions */}
      {isHost && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800 text-center">
            💡 <strong>Host Mode:</strong> Click on any number to manually mark it as called
          </p>
        </div>
      )}
    </div>
  );
};

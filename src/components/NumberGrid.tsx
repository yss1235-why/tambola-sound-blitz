// src/components/NumberGrid.tsx - UPDATED: Automatic calling only, no manual clicking
import React from 'react';

interface NumberGridProps {
  calledNumbers: number[];
  currentNumber: number | null;
  isHost?: boolean;
  isCallingNumber?: boolean; // Show calling state
}

export const NumberGrid: React.FC<NumberGridProps> = ({ 
  calledNumbers, 
  currentNumber, 
  isHost = false,
  isCallingNumber = false
}) => {
  const numbers = Array.from({ length: 90 }, (_, i) => i + 1);

  const getNumberStyle = (number: number) => {
    const isCalled = calledNumbers.includes(number);
    const isCurrent = currentNumber === number;
    
    let baseClass = 'number-cell transition-all duration-300 flex items-center justify-center rounded-xl font-bold text-sm border-2';
    
    if (isCurrent) {
      return `${baseClass} current bg-gradient-to-br from-yellow-400 to-yellow-600 text-white shadow-xl transform scale-110 ring-4 ring-yellow-300 ring-opacity-50 animate-pulse`;
    }
    
    if (isCalled) {
      return `${baseClass} called bg-gradient-to-br from-emerald-400 to-emerald-500 text-white shadow-lg border-emerald-400`;
    }
    
    return `${baseClass} bg-gradient-to-br from-slate-100 to-slate-200 text-slate-800 border-slate-300 hover:border-slate-400 hover:from-slate-200 hover:to-slate-300`;
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
      {/* Header - Simple legend for all users */}
      <div className="mb-4 text-center">
        <div className="flex justify-center space-x-4 text-sm text-gray-600">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-300 rounded"></div>
            <span>Not Called</span>
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

      {/* Show calling state for hosts */}
      {isHost && isCallingNumber && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center justify-center space-x-2 text-yellow-800">
            <div className="w-4 h-4 border-2 border-yellow-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-medium">
              Calling number automatically... Please wait.
            </p>
          </div>
        </div>
      )}

      {/* Game Progress Indicator */}
      <div className="mt-4 bg-gray-50 rounded-lg p-3">
        <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
          <span>Game Progress</span>
          <span>{calledNumbers.length}/90 numbers called</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(calledNumbers.length / 90) * 100}%` }}
          ></div>
        </div>
        <div className="text-xs text-gray-500 mt-1 text-center">
          {90 - calledNumbers.length} numbers remaining
        </div>
      </div>
    </div>
  );
};

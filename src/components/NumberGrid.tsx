
import React from 'react';

interface NumberGridProps {
  calledNumbers: number[];
  currentNumber: number | null;
}

export const NumberGrid: React.FC<NumberGridProps> = ({ calledNumbers, currentNumber }) => {
  const numbers = Array.from({ length: 90 }, (_, i) => i + 1);

  const getNumberStyle = (number: number) => {
    const isCalled = calledNumbers.includes(number);
    const isCurrent = currentNumber === number;
    
    if (isCurrent) {
      return 'number-cell current bg-gradient-to-br from-yellow-400 to-yellow-600 text-white shadow-xl transform scale-110';
    }
    
    if (isCalled) {
      return 'number-cell called';
    }
    
    return 'number-cell';
  };

  return (
    <div className="number-grid">
      {numbers.map((number) => (
        <div
          key={number}
          className={getNumberStyle(number)}
        >
          {number}
        </div>
      ))}
    </div>
  );
};

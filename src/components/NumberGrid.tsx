// src/components/NumberGrid.tsx - THEMED: Uses CSS variables for complete theme support
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

    // Base class uses CSS .number-cell from index.css with theme variables
    let baseClass = 'number-cell';

    if (isCurrent) {
      // Uses CSS .number-cell.current with theme's --game-current color
      return `${baseClass} current`;
    }

    if (isCalled) {
      // Uses CSS .number-cell.called with theme's --game-called color
      return `${baseClass} called`;
    }

    // Default uncalled state uses theme's --game-cell color
    return baseClass;
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
      {/* Header - Legend with theme colors */}
      <div className="mb-4 text-center">
        <div className="flex justify-center space-x-4 text-sm text-muted-foreground">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded border-2 border-border" style={{ background: 'hsl(var(--game-cell))' }}></div>
            <span>Not Called</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded" style={{ background: 'hsl(var(--game-called))' }}></div>
            <span>Called</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded" style={{ background: 'hsl(var(--game-current))' }}></div>
            <span>Current</span>
          </div>
        </div>
      </div>

      {/* Number Grid - Display Only */}
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

      {/* Show calling state for hosts - themed */}
      {isHost && isCallingNumber && (
        <div className="mt-4 p-3 bg-accent border border-border rounded-lg">
          <div className="flex items-center justify-center space-x-2 text-accent-foreground">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-medium">
              Calling number automatically... Please wait.
            </p>
          </div>
        </div>
      )}

      {/* Game Progress Indicator - themed */}
      <div className="mt-4 bg-muted rounded-lg p-3">
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
          <span>Game Progress</span>
          <span>{calledNumbers.length}/90 numbers called</span>
        </div>
        <div className="w-full bg-secondary rounded-full h-2">
          <div
            className="h-2 rounded-full transition-all duration-300"
            style={{
              width: `${(calledNumbers.length / 90) * 100}%`,
              background: 'linear-gradient(to right, hsl(var(--primary)), hsl(var(--accent)))'
            }}
          ></div>
        </div>
        <div className="text-xs text-muted-foreground mt-1 text-center">
          {90 - calledNumbers.length} numbers remaining
        </div>
      </div>
    </div>
  );
};

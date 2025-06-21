//src/utils/ticketRenderer.tsx
import React from 'react';
import { TambolaTicket } from '@/services/firebase';
import { Clock, AlertCircle, CheckCircle } from 'lucide-react';

interface TicketRendererProps {
  ticket: TambolaTicket;
  calledNumbers: number[];
  showPlayerInfo?: boolean;
  patternHighlight?: string; // NEW: For pattern highlighting
}

// Pattern position detection logic
const isPatternPosition = (index: number, prizeId?: string): boolean => {
  if (!prizeId) return false;
  
  const row = Math.floor(index / 9);
  const col = index % 9;
  
  switch (prizeId) {
    case 'topLine':
      return row === 0;
    case 'middleLine':
      return row === 1;
    case 'bottomLine':
      return row === 2;
    case 'corner':
      return (row === 0 || row === 2) && (col === 0 || col === 8);
    case 'starCorner':
      return ((row === 0 || row === 2) && (col === 0 || col === 8)) || 
             (row === 1 && col === 4);
    case 'quickFive':
    case 'fullHouse':
      return true; // All positions are part of these patterns
    default:
      return false;
  }
};

// Helper function for pattern names
const getPatternName = (prizeId: string): string => {
  switch (prizeId) {
    case 'quickFive': return 'First 5 Numbers';
    case 'topLine': return 'Top Line Complete';
    case 'middleLine': return 'Middle Line Complete';
    case 'bottomLine': return 'Bottom Line Complete';
    case 'corner': return '4 Corners';
    case 'starCorner': return '4 Corners + Center';
    case 'fullHouse': return 'Full House';
    default: return 'Winning Pattern';
  }
};

export const renderTicket = ({ 
  ticket, 
  calledNumbers, 
  showPlayerInfo = true, 
  patternHighlight 
}: TicketRendererProps) => {
  // ✅ SAFETY CHECK 1: Verify ticket exists
  if (!ticket) {
    return (
      <div className="bg-gray-100 p-4 rounded-lg border-2 border-gray-200">
        <div className="text-center py-4">
          <div className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-sm text-gray-500">Loading ticket...</p>
        </div>
      </div>
    );
  }

  // ✅ SAFETY CHECK 2: Verify ticket has rows property
  if (!ticket.rows) {
    return (
      <div className="bg-yellow-50 p-4 rounded-lg border-2 border-yellow-200">
        <div className="text-center py-4">
          <Clock className="w-6 h-6 text-yellow-600 mx-auto mb-2" />
          <p className="text-sm text-yellow-700">
            Ticket {ticket.ticketId} - Data updating...
          </p>
          <p className="text-xs text-yellow-600 mt-1">
            ✅ New format loading - please wait
          </p>
        </div>
      </div>
    );
  }

  // ✅ SAFETY CHECK 3: Verify rows is an array with proper structure
  if (!Array.isArray(ticket.rows) || ticket.rows.length !== 3) {
    return (
      <div className="bg-red-50 p-4 rounded-lg border-2 border-red-200">
        <div className="text-center py-4">
          <AlertCircle className="w-4 h-4 text-red-600 mx-auto mb-1" />
          <p className="text-sm text-red-700">
            Ticket {ticket.ticketId} - Invalid data structure
          </p>
          <p className="text-xs text-red-600 mt-1">
            Expected 3 rows, got {Array.isArray(ticket.rows) ? ticket.rows.length : 'non-array'}
          </p>
        </div>
      </div>
    );
  }

  // ✅ SAFETY CHECK 4: Verify each row is an array with proper length
  const isValidStructure = ticket.rows.every(row => Array.isArray(row) && row.length === 9);
  if (!isValidStructure) {
    return (
      <div className="bg-red-50 p-4 rounded-lg border-2 border-red-200">
        <div className="text-center py-4">
          <AlertCircle className="w-4 h-4 text-red-600 mx-auto mb-1" />
          <p className="text-sm text-red-700">
            Ticket {ticket.ticketId} - Corrupted grid structure
          </p>
          <p className="text-xs text-red-600 mt-1">
            Each row should have 9 columns
          </p>
        </div>
      </div>
    );
  }

  // ✅ SAFETY CHECK 5: Safe flattening with error handling
  let allNumbers: number[] = [];
  try {
    allNumbers = ticket.rows.flat();
    
    // Verify we have the expected number of cells (27 total)
    if (allNumbers.length !== 27) {
      throw new Error(`Expected 27 cells, got ${allNumbers.length}`);
    }
  } catch (error) {
    console.error('Error processing ticket rows:', error, ticket);
    return (
      <div className="bg-red-50 p-4 rounded-lg border-2 border-red-200">
        <div className="text-center py-4">
          <AlertCircle className="w-4 h-4 text-red-600 mx-auto mb-1" />
          <p className="text-sm text-red-700">
            Ticket {ticket.ticketId} - Processing error
          </p>
          <p className="text-xs text-red-600 mt-1">
            Grid processing failed: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      </div>
    );
  }

  // ✅ ALL CHECKS PASSED: Render the ticket normally
  return (
    <div className="bg-white p-4 rounded-lg border-2 border-blue-200">
      {showPlayerInfo && ticket.playerName && (
        <div className="mb-3 text-center">
          <div className="flex items-center justify-center space-x-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <p className="font-semibold text-gray-800">Ticket {ticket.ticketId}</p>
          </div>
          <p className="text-sm text-gray-600">{ticket.playerName}</p>
        </div>
      )}
      <div className="grid grid-cols-9 gap-1">
        {allNumbers.map((number, index) => {
          const isMarked = number !== 0 && calledNumbers.includes(number);
          const isEmpty = number === 0;
          const isPattern = isPatternPosition(index, patternHighlight);
          
          return (
            <div
              key={index}
              className={`
                aspect-square flex items-center justify-center text-xs font-bold rounded transition-all duration-200
                ${isEmpty 
                  ? 'bg-gray-100' 
                  : isMarked 
                    ? `bg-green-500 text-white shadow-md transform scale-105 ${isPattern ? 'ring-2 ring-yellow-300' : ''}` 
                    : isPattern
                      ? 'bg-yellow-50 border-2 border-yellow-400 text-gray-800 pattern-highlight'
                      : 'bg-yellow-50 text-gray-800 border border-gray-300 hover:bg-yellow-100'
                }
              `}
            >
              {number !== 0 ? number : ''}
            </div>
          );
        })}
      </div>
      
      {/* Pattern explanation for highlighted tickets */}
      {patternHighlight && (
        <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-center">
          <p className="text-xs text-blue-800 font-medium">
            🎯 Winning Pattern: {getPatternName(patternHighlight)}
          </p>
          <p className="text-xs text-blue-600 mt-1">
            ✅ Green: Called numbers • 🟡 Yellow border: Pattern positions
          </p>
        </div>
      )}
    </div>
  );
};

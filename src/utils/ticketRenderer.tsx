//src/utils/ticketRenderer.tsx
import React from 'react';
import { TambolaTicket } from '@/services/firebase';
import { Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { computeTicketMetadata } from '../services/prize-engine';

/**
 * Shared utility: Resolve a winner's ticketId (which may be comma-separated for
 * Half Sheet / Full Sheet prizes) into actual ticket objects.
 */
export const resolveWinnerTickets = (
  ticketId: string,
  tickets: { [id: string]: TambolaTicket }
): { isMultiTicket: boolean; ticketIds: string[]; tickets: TambolaTicket[] } => {
  const isMultiTicket = ticketId?.includes(',') ?? false;
  const ticketIds = isMultiTicket
    ? ticketId.split(',').map(id => id.trim())
    : [ticketId];
  const resolved = ticketIds
    .map(id => tickets[id])
    .filter(Boolean);
  return { isMultiTicket, ticketIds, tickets: resolved };
};

interface TicketRendererProps {
  ticket: TambolaTicket;
  calledNumbers: number[];
  showPlayerInfo?: boolean;
  patternHighlight?: string; // NEW: For pattern highlighting
}

// ✅ COMPLETELY FIXED: Pattern position detection with debugging
const isPatternPosition = (
  index: number,
  prizeId?: string,
  ticket?: TambolaTicket,
  calledNumbers?: number[]
): boolean => {
  if (!prizeId || !ticket?.rows || !Array.isArray(ticket.rows)) {
    return false;
  }

  const row = Math.floor(index / 9);
  const col = index % 9;

  // Safety check for row bounds
  if (row < 0 || row >= 3 || col < 0 || col >= 9) {
    return false;
  }

  const currentNumber = ticket.rows[row][col];

  // Skip empty positions (0) - these should never be highlighted
  if (currentNumber === 0) {
    return false;
  }

  switch (prizeId) {
    case 'topLine':
      return row === 0;
    case 'middleLine':
      return row === 1;
    case 'bottomLine':
      return row === 2;

    case 'corner': {
      // ✅ DYNAMIC CORNER DETECTION: Only actual corner numbers, not positions
      const topNumbers = ticket.rows[0].filter(n => n > 0);
      const bottomNumbers = ticket.rows[2].filter(n => n > 0);

      if (topNumbers.length === 0 || bottomNumbers.length === 0) {
        return false;
      }

      // Calculate the 4 actual corner numbers (leftmost & rightmost of top/bottom)
      const cornerNumbers = [
        topNumbers[0],                          // Leftmost top
        topNumbers[topNumbers.length - 1],      // Rightmost top
        bottomNumbers[0],                       // Leftmost bottom
        bottomNumbers[bottomNumbers.length - 1] // Rightmost bottom
      ];

      const isCorner = cornerNumbers.includes(currentNumber);
      // Log removed for performance

      return isCorner;
    }

    case 'starCorner': {
      // ✅ DYNAMIC STAR CORNER: 4 corners + center number
      const topNumbers = ticket.rows[0].filter(n => n > 0);
      const bottomNumbers = ticket.rows[2].filter(n => n > 0);
      const middleNumbers = ticket.rows[1].filter(n => n > 0);

      if (topNumbers.length === 0 || bottomNumbers.length === 0 || middleNumbers.length === 0) {
        return false;
      }

      // Get the 4 corner numbers
      const cornerNumbers = [
        topNumbers[0],
        topNumbers[topNumbers.length - 1],
        bottomNumbers[0],
        bottomNumbers[bottomNumbers.length - 1]
      ];

      // Get center number (middle of middle row)
      const centerNumber = middleNumbers[Math.floor(middleNumbers.length / 2)];

      // Combine corners + center
      const starCornerNumbers = [...cornerNumbers, centerNumber];

      const isStarCorner = starCornerNumbers.includes(currentNumber);
      // Log removed for performance

      return isStarCorner;
    }

    case 'earlyFive': {
      // ✅ EARLY FIVE: Only the first 5 called numbers from this ticket
      if (!calledNumbers || calledNumbers.length === 0) return false;

      // Get all non-zero numbers from this ticket
      const allTicketNumbers = ticket.metadata?.allNumbers || computeTicketMetadata(ticket).allNumbers;

      // Find ticket numbers that were called, preserving call order
      const calledTicketNumbers = calledNumbers.filter(num => allTicketNumbers.includes(num));

      // Only first 5 called numbers get highlighted
      const firstFiveCalled = calledTicketNumbers.slice(0, 5);

      const isEarlyFive = firstFiveCalled.includes(currentNumber);
      // Log removed for performance

      return isEarlyFive;
    }

    case 'fullHouse': {
      // Full house: all non-zero positions (we already checked currentNumber > 0)
      return true;
    }

    case 'secondFullHouse': {
      // Second Full House: same pattern as Full House - all non-zero positions
      return true;
    }

    case 'halfSheet':
    case 'fullSheet': {
      // Sheet prizes: all numbers on each ticket are part of the winning pattern
      return true;
    }

    default:
      return false;
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
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-sm text-amber-700">Loading ticket...</p>
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
    allNumbers = ticket.rows.flat(); // For 27-cell grid display

    // Verify we have the expected number of cells (27 total)
    if (allNumbers.length !== 27) {
      throw new Error(`Expected 27 cells, got ${allNumbers.length}`);
    }
  } catch (error) {
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
    <div className="bg-amber-50 p-2 rounded-lg border-2 border-yellow-500">
      {showPlayerInfo && ticket.playerName && (
        <div className="mb-2 flex items-center justify-between px-2">
          <div className="flex items-center space-x-1">
            <CheckCircle className="w-3 h-3 text-green-600" />
            <p className="text-sm font-semibold text-amber-900">Ticket {ticket.ticketId}</p>
          </div>
          <p className="text-sm text-amber-800">{ticket.playerName}</p>
        </div>
      )}
      <div className="grid grid-cols-9 gap-1">
        {allNumbers.map((number, index) => {
          const isMarked = number !== 0 && calledNumbers.includes(number);
          const isEmpty = number === 0;
          const isPattern = isPatternPosition(index, patternHighlight, ticket, calledNumbers);

          return (
            <div
              key={index}
              className={`
                aspect-square flex items-center justify-center text-xs font-bold rounded transition-all duration-200 text-black
                ${isEmpty
                  ? 'bg-gray-100/20 border-2 border-yellow-500'
                  : isMarked
                    ? `bg-green-300/50 border-2 border-yellow-500 shadow-md transform scale-105 ${isPattern ? 'ring-2 ring-yellow-300' : ''}`
                    : isPattern
                      ? 'bg-green-200/50 border-2 border-yellow-500'
                      : 'bg-white border-2 border-yellow-500'
                }
              `}
            >
              {number === 0 ? '' : number}
            </div>
          );
        })}
      </div>

    </div>
  );
};

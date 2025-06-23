// src/services/prize-engine.ts - Dedicated Prize Validation Engine

import { 
  type TambolaTicket,
  type Prize,
  type TicketMetadata
} from './firebase-core';

// ================== UTILITY FUNCTIONS ==================

/**
 * Computes metadata for a ticket including corners, center, and all numbers
 */
export const computeTicketMetadata = (ticket: TambolaTicket): TicketMetadata => {
  if (!ticket.rows || !Array.isArray(ticket.rows) || ticket.rows.length !== 3) {
    console.warn(`Invalid ticket structure for ${ticket.ticketId}`);
    return {
      corners: [],
      center: 0,
      hasValidCorners: false,
      hasValidCenter: false,
      allNumbers: []
    };
  }

  for (let i = 0; i < 3; i++) {
    if (!Array.isArray(ticket.rows[i]) || ticket.rows[i].length !== 9) {
      console.warn(`Invalid row ${i} for ticket ${ticket.ticketId}`);
      return {
        corners: [],
        center: 0,
        hasValidCorners: false,
        hasValidCenter: false,
        allNumbers: []
      };
    }
  }

  const corners = [
    ticket.rows[0][0],
    ticket.rows[0][8],
    ticket.rows[2][0],
    ticket.rows[2][8]
  ];

  const center = ticket.rows[1][4];
  const validCorners = corners.filter(n => n > 0);
  const hasValidCorners = validCorners.length === 4;
  const hasValidCenter = center > 0;
  const allNumbers = ticket.rows.flat().filter(n => n > 0);

  return {
    corners: validCorners,
    center,
    hasValidCorners,
    hasValidCenter,
    allNumbers
  };
};

/**
 * ✅ FIXED: Dynamic corner detection for any ticket
 */
export const getTicketCorners = (ticket: TambolaTicket): number[] => {
  const topRow = ticket.rows[0].filter(n => n > 0);
  const bottomRow = ticket.rows[2].filter(n => n > 0);
  
  return [
    topRow[0],     // First top
    topRow[4],     // Last top (guaranteed 5 numbers)
    bottomRow[0],  // First bottom  
    bottomRow[4]   // Last bottom
  ];
};

/**
 * ✅ FIXED: Dynamic star corner detection (4 corners + center)
 */
export const getStarCorners = (ticket: TambolaTicket): number[] => {
  const corners = getTicketCorners(ticket);
  const middleRow = ticket.rows[1].filter(n => n > 0);
  const center = middleRow[2]; // Center number (guaranteed 5 numbers)
  
  return [...corners, center];
};

// ================== PRIZE CONFIGURATION ==================

/**
 * Creates prize configuration based on selected prize types
 */
export const createPrizeConfiguration = (selectedPrizes: string[]): { [prizeId: string]: Prize } => {
  const availablePrizes = {
    quickFive: {
      id: 'quickFive',
      name: 'Quick Five',
      pattern: 'First 5 numbers',
      description: 'First player to mark 5 numbers',
      won: false,
      order: 1
    },
    earlyFive: {
      id: 'earlyFive',
      name: 'Early Five',
      pattern: 'Any 5 numbers',
      description: 'Mark any 5 numbers on your ticket',
      won: false,
      order: 1.5
    },
    corners: {
      id: 'corners',
      name: 'Corners',
      pattern: '4 corner numbers',
      description: 'Mark all 4 corner numbers',
      won: false,
      order: 2
    },
    halfSheet: {
      id: 'halfSheet',
      name: 'Half Sheet',
      pattern: 'Any 15 numbers',
      description: 'Mark any 15 numbers on your ticket',
      won: false,
      order: 2.5
    },
    topLine: {
      id: 'topLine',
      name: 'Top Line',
      pattern: 'Complete top row',
      description: 'Complete the top row of any ticket',
      won: false,
      order: 3
    },
    middleLine: {
      id: 'middleLine',
      name: 'Middle Line',
      pattern: 'Complete middle row',
      description: 'Complete the middle row of any ticket',
      won: false,
      order: 4
    },
    bottomLine: {
      id: 'bottomLine',
      name: 'Bottom Line',
      pattern: 'Complete bottom row',
      description: 'Complete the bottom row of any ticket',
      won: false,
      order: 5
    },
    starCorner: {
      id: 'starCorner',
      name: 'Star Corner',
      pattern: '4 corners + center',
      description: 'Mark all 4 corner positions plus center position',
      won: false,
      order: 6
    },
    fullHouse: {
      id: 'fullHouse',
      name: 'Full House',
      pattern: 'All numbers',
      description: 'Mark all numbers on the ticket',
      won: false,
      order: 7
    }
  };

  const prizes: { [prizeId: string]: Prize } = {};
  for (const prizeId of selectedPrizes) {
    if (availablePrizes[prizeId as keyof typeof availablePrizes]) {
      prizes[prizeId] = availablePrizes[prizeId as keyof typeof availablePrizes];
    }
  }

  return prizes;
};

// ================== CORE PRIZE VALIDATION ENGINE ==================

/**
 * Main prize validation engine - validates all tickets against all prizes
 */
export const validateTicketsForPrizes = async (
  tickets: { [ticketId: string]: TambolaTicket },
  calledNumbers: number[],
  prizes: { [prizeId: string]: Prize }
): Promise<{ winners: { [prizeId: string]: any } }> => {
  const startTime = Date.now();
  const winners: { [prizeId: string]: any } = {};

  for (const [prizeId, prize] of Object.entries(prizes)) {
    if (prize.won) continue;

    const prizeWinners: { name: string; ticketId: string; phone?: string }[] = [];

    for (const [ticketId, ticket] of Object.entries(tickets)) {
      if (!ticket.isBooked || !ticket.rows || !Array.isArray(ticket.rows)) {
        continue;
      }

      let hasWon = false;

      try {
        switch (prizeId) {
          case 'quickFive':
          case 'earlyFive':
            const markedCount = ticket.metadata?.allNumbers.filter(num => 
              calledNumbers.includes(num)
            ).length || 0;
            hasWon = markedCount >= 5;
            break;

          case 'halfSheet':
            const halfSheetMarkedCount = ticket.metadata?.allNumbers.filter(num => 
              calledNumbers.includes(num)
            ).length || 0;
            hasWon = halfSheetMarkedCount >= 15;
            break;

          case 'fullHouse':
            const allNumbers = ticket.metadata?.allNumbers || ticket.rows.flat().filter(n => n > 0);
            hasWon = allNumbers.every(num => calledNumbers.includes(num));
            break;

          case 'corners':
            const corners = getTicketCorners(ticket);
            hasWon = corners.every(corner => calledNumbers.includes(corner));
            console.log(`🎯 Corners check:`, { ticketId, corners, hasWon });
            break;

          case 'starCorner':
            const starCorners = getStarCorners(ticket);
            hasWon = starCorners.every(corner => calledNumbers.includes(corner));
            console.log(`⭐ Star corners check:`, { ticketId, starCorners, hasWon });
            break;

          case 'topLine':
            hasWon = ticket.rows[0].filter(num => num > 0).every(num => calledNumbers.includes(num));
            break;

          case 'middleLine':
            hasWon = ticket.rows[1].filter(num => num > 0).every(num => calledNumbers.includes(num));
            break;

          case 'bottomLine':
            hasWon = ticket.rows[2].filter(num => num > 0).every(num => calledNumbers.includes(num));
            break;

          default:
            // Handle custom set-based prizes (quickFive for sets)
            if (prizeId.includes('Set')) {
              const setId = parseInt(prizeId.replace(/\D/g, ''));
              if (!isNaN(setId)) {
                const targetPositions = prizeId.includes('quickFive') ? 
                  [1, 2, 3] : [4, 5, 6];
                
                const sameSetTickets = Object.values(tickets).filter(t => 
                  t.isBooked && t.setId === setId && 
                  targetPositions.includes(t.positionInSet || 0)
                );
                
                if (sameSetTickets.length === 3) {
                  hasWon = sameSetTickets.every(t => {
                    const markedCount = t.metadata?.allNumbers.filter(num => 
                      calledNumbers.includes(num)
                    ).length || 0;
                    return markedCount >= 2;
                  });
                }
              }
            } else {
              console.warn(`Unknown prize type: ${prizeId} - skipping validation`);
              continue;
            }
        }
      } catch (error) {
        console.error(`Prize validation error for ${prizeId} on ticket ${ticketId}:`, error);
        hasWon = false;
      }

      if (hasWon) {
        prizeWinners.push({
          name: ticket.playerName,
          ticketId: ticket.ticketId,
          phone: ticket.playerPhone
        });
      }
    }

    if (prizeWinners.length > 0) {
      winners[prizeId] = {
        prizeName: prize.name,
        winners: prizeWinners
      };
    }
  }

  const endTime = Date.now();
  if (process.env.NODE_ENV === 'development' && endTime - startTime > 50) {
    console.warn(`Slow prize validation: ${endTime - startTime}ms for ${Object.keys(tickets).length} tickets`);
  }

  return { winners };
};

// ================== EXPORT SINGLETON CLASS ==================

/**
 * Prize Engine - Handles all prize-related logic
 * Separated from firebase-game for better modularity
 */
export class PrizeEngine {
  /**
   * Validate tickets for prizes (main method)
   */
  async validateTicketsForPrizes(
    tickets: { [ticketId: string]: TambolaTicket },
    calledNumbers: number[],
    prizes: { [prizeId: string]: Prize }
  ): Promise<{ winners: { [prizeId: string]: any } }> {
    return validateTicketsForPrizes(tickets, calledNumbers, prizes);
  }

  /**
   * Create prize configuration
   */
  createPrizeConfiguration(selectedPrizes: string[]): { [prizeId: string]: Prize } {
    return createPrizeConfiguration(selectedPrizes);
  }

  /**
   * Generate prizes (alias for compatibility)
   */
  generatePrizes(selectedPrizes: string[]): { [prizeId: string]: Prize } {
    return this.createPrizeConfiguration(selectedPrizes);
  }

  /**
   * Get ticket corners dynamically
   */
  getTicketCorners(ticket: TambolaTicket): number[] {
    return getTicketCorners(ticket);
  }

  /**
   * Get star corners (4 corners + center)
   */
  getStarCorners(ticket: TambolaTicket): number[] {
    return getStarCorners(ticket);
  }

  /**
   * Compute ticket metadata
   */
  computeTicketMetadata(ticket: TambolaTicket): TicketMetadata {
    return computeTicketMetadata(ticket);
  }
}

// Export singleton instance
export const prizeEngine = new PrizeEngine();

// src/services/prize-engine.ts - FIXED with Traditional Logic

import {
  type TambolaTicket,
  type Prize,
  type TicketMetadata
} from './firebase-core';
import { FEATURE_FLAGS } from './feature-flags';

// ================== UTILITY FUNCTIONS ==================

/**
 * Computes metadata for a ticket including corners, center, and all numbers
 */
export const computeTicketMetadata = (ticket: TambolaTicket): TicketMetadata => {
  if (!ticket.rows || !Array.isArray(ticket.rows) || ticket.rows.length !== 3) {
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
    topRow[topRow.length - 1],     // Last top
    bottomRow[0],  // First bottom  
    bottomRow[bottomRow.length - 1]   // Last bottom
  ];
};

/**
 * ✅ FIXED: Dynamic star corner detection (4 corners + center)
 */
export const getStarCorners = (ticket: TambolaTicket): number[] => {
  const corners = getTicketCorners(ticket);
  const middleRow = ticket.rows[1].filter(n => n > 0);
  const center = middleRow[Math.floor(middleRow.length / 2)]; // Center number (middle of middle row)

  return [...corners, center];
};

// ================== PRIZE CONFIGURATION ==================

/**
 * Creates prize configuration based on selected prize types
 */
export const createPrizeConfiguration = (selectedPrizes: string[]): { [prizeId: string]: Prize } => {
  const availablePrizes = {
    fullHouse: {
      id: 'fullHouse',
      name: 'Full House',
      pattern: 'All numbers',
      description: 'Mark all numbers on the ticket',
      won: false,
      order: 1
    },
    secondFullHouse: {
      id: 'secondFullHouse',
      name: 'Second Full House',
      pattern: 'All numbers (after first)',
      description: 'Second player to mark all numbers after Full House is won',
      won: false,
      order: 2
    },
    fullSheet: {
      id: 'fullSheet',
      name: 'Full Sheet',
      pattern: 'Complete 6-ticket set',
      description: 'Complete entire traditional 6-ticket sheet (positions 1,2,3,4,5,6)',
      won: false,
      order: 3
    },
    halfSheet: {
      id: 'halfSheet',
      name: 'Half Sheet',
      pattern: '3 consecutive tickets from same set',
      description: 'Complete half of a traditional 6-ticket sheet (positions 1,2,3 or 4,5,6)',
      won: false,
      order: 4
    },
    starCorner: {
      id: 'starCorner',
      name: 'Star Corner',
      pattern: '4 corners + center',
      description: 'Mark all 4 corner positions plus center position',
      won: false,
      order: 5
    },

    corners: {
      id: 'corners',
      name: 'Corners',
      pattern: '4 corner numbers',
      description: 'Mark all 4 corner numbers',
      won: false,
      order: 6
    },
    topLine: {
      id: 'topLine',
      name: 'Top Line',
      pattern: 'Complete top row',
      description: 'Complete the top row of any ticket',
      won: false,
      order: 7
    },
    middleLine: {
      id: 'middleLine',
      name: 'Middle Line',
      pattern: 'Complete middle row',
      description: 'Complete the middle row of any ticket',
      won: false,
      order: 8
    },
    bottomLine: {
      id: 'bottomLine',
      name: 'Bottom Line',
      pattern: 'Complete bottom row',
      description: 'Complete the bottom row of any ticket',
      won: false,
      order: 9
    },

    earlyFive: {
      id: 'earlyFive',
      name: 'Early Five',
      pattern: 'Any 5 numbers',
      description: 'Mark any 5 numbers on your ticket',
      won: false,
      order: 10
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

// ================== TRADITIONAL LOGIC HELPERS ==================

/**
 * ✅ NEW: Validate Half Sheet with TRADITIONAL logic
 * Player must book exactly 3 tickets in positions [1,2,3] OR [4,5,6] within SAME setId
 * Each of the 3 tickets must have exactly 2+ marked numbers
 */
const validateHalfSheetTraditional = (
  tickets: { [ticketId: string]: TambolaTicket },
  calledNumbers: number[]
): { [playerName: string]: { ticketIds: string[]; setId: number; positions: number[] } } => {
  const winners: { [playerName: string]: { ticketIds: string[]; setId: number; positions: number[] } } = {};

  // Group booked tickets by player and setId
  const playerSets: {
    [playerName: string]: {
      [setId: number]: TambolaTicket[]
    }
  } = {};

  for (const ticket of Object.values(tickets)) {
    if (!ticket.isBooked || !ticket.setId || !ticket.positionInSet || !ticket.playerName) continue;

    if (!playerSets[ticket.playerName]) {
      playerSets[ticket.playerName] = {};
    }
    if (!playerSets[ticket.playerName][ticket.setId]) {
      playerSets[ticket.playerName][ticket.setId] = [];
    }
    playerSets[ticket.playerName][ticket.setId].push(ticket);
  }

  // Check each player's sets for valid half sheets
  for (const [playerName, sets] of Object.entries(playerSets)) {
    for (const [setId, setTickets] of Object.entries(sets)) {
      const setIdNum = parseInt(setId);

      // ✅ Check FIRST HALF [1,2,3] independently
      const firstHalfTickets = setTickets.filter(t => [1, 2, 3].includes(t.positionInSet));
      if (firstHalfTickets.length === 3) {
        // Verify each ticket has 2+ marked numbers
        const allHave2Plus = firstHalfTickets.every(t => {
          const allNumbers = t.metadata?.allNumbers || computeTicketMetadata(t).allNumbers;
          const markedCount = allNumbers.filter(num => calledNumbers.includes(num)).length;
          return markedCount >= 2;
        });

        if (allHave2Plus) {
          // Create unique key for multiple wins per player
          const winnerKey = `${playerName}_Set${setId}_First`;
          winners[winnerKey] = {
            ticketIds: firstHalfTickets.map(t => t.ticketId),
            setId: setIdNum,
            positions: [1, 2, 3]
          };
        }
      }

      // ✅ Check SECOND HALF [4,5,6] independently
      const secondHalfTickets = setTickets.filter(t => [4, 5, 6].includes(t.positionInSet));
      if (secondHalfTickets.length === 3) {
        // Verify each ticket has 2+ marked numbers
        const allHave2Plus = secondHalfTickets.every(t => {
          const allNumbers = t.metadata?.allNumbers || computeTicketMetadata(t).allNumbers;
          const markedCount = allNumbers.filter(num => calledNumbers.includes(num)).length;
          return markedCount >= 2;
        });

        if (allHave2Plus) {
          // Create unique key for multiple wins per player
          const winnerKey = `${playerName}_Set${setId}_Second`;
          winners[winnerKey] = {
            ticketIds: secondHalfTickets.map(t => t.ticketId),
            setId: setIdNum,
            positions: [4, 5, 6]
          };
        }
      }
    }
  }

  return winners;
};

/**
 * ✅ NEW: Validate Full Sheet with TRADITIONAL logic
 * Player must book all 6 tickets in positions [1,2,3,4,5,6] within SAME setId
 * Each of the 6 tickets must have exactly 2+ marked numbers
 */
const validateFullSheetTraditional = (
  tickets: { [ticketId: string]: TambolaTicket },
  calledNumbers: number[]
): { [playerName: string]: { ticketIds: string[]; setId: number } } => {
  const winners: { [playerName: string]: { ticketIds: string[]; setId: number } } = {};

  // Group booked tickets by player and setId
  const playerSets: {
    [playerName: string]: {
      [setId: number]: TambolaTicket[]
    }
  } = {};

  for (const ticket of Object.values(tickets)) {
    if (!ticket.isBooked || !ticket.setId || !ticket.positionInSet || !ticket.playerName) continue;

    if (!playerSets[ticket.playerName]) {
      playerSets[ticket.playerName] = {};
    }
    if (!playerSets[ticket.playerName][ticket.setId]) {
      playerSets[ticket.playerName][ticket.setId] = [];
    }
    playerSets[ticket.playerName][ticket.setId].push(ticket);
  }

  // Check each player's sets for complete full sheets
  for (const [playerName, sets] of Object.entries(playerSets)) {
    for (const [setId, setTickets] of Object.entries(sets)) {
      const setIdNum = parseInt(setId);

      // Check if player has all 6 positions [1,2,3,4,5,6]
      if (setTickets.length === 6) {
        const positions = setTickets.map(t => t.positionInSet).sort();
        const expectedPositions = [1, 2, 3, 4, 5, 6];

        // Verify all positions are present
        const hasAllPositions = expectedPositions.every(pos => positions.includes(pos));

        if (hasAllPositions) {
          // Verify each ticket has 2+ marked numbers
          const allHave2Plus = setTickets.every(t => {
            const markedCount = t.metadata?.allNumbers.filter(num => calledNumbers.includes(num)).length || 0;
            return markedCount >= 2;
          });

          if (allHave2Plus) {
            winners[playerName] = {
              ticketIds: setTickets.map(t => t.ticketId),
              setId: setIdNum
            };
          }
        }
      }
    }
  }

  return winners;
};

// ================== INDIVIDUAL PRIZE VALIDATORS ==================

/**
 * Validates Early Five prize - first player to mark any 5 numbers wins
 */


const validateEarlyFive = (
  ticket: TambolaTicket,
  calledNumbers: number[]
): boolean => {
  try {
    const markedCount = ticket.metadata?.allNumbers.filter(num =>
      calledNumbers.includes(num)
    ).length || 0;
    return markedCount >= 5;
  } catch (error) {
    return false;
  }
};

/**
 * Validates Second Full House prize - keeps original logic exactly as-is
 */
const validateSecondFullHouse = (
  ticket: TambolaTicket,
  calledNumbers: number[],
  prizes: { [prizeId: string]: Prize }
): boolean => {
  try {
    // Step 1: Full House must be won first
    if (!prizes.fullHouse.won) {
      return false;
    }

    // Step 2: Current ticket must have all numbers marked
    const allNumbers = ticket.metadata?.allNumbers || computeTicketMetadata(ticket).allNumbers;
    const hasAllNumbers = allNumbers.every(num => calledNumbers.includes(num));

    // Log removed for performance

    // Step 3: Must have all numbers to proceed
    if (!hasAllNumbers) {
      return false;
    }

    // Step 4: 🔧 FIXED - Handle missing/invalid winners list
    const fullHouseWinners = prizes.fullHouse.winners;
    if (!fullHouseWinners || !Array.isArray(fullHouseWinners)) {
      console.warn(`⚠️ Full House won but winners list is invalid:`, {
        won: prizes.fullHouse.won,
        winners: fullHouseWinners
      });

      // Phase 2 fix: strict validation rejects corrupted data
      if (FEATURE_FLAGS.USE_STRICT_SECOND_FULLHOUSE) {
        return false;
      }

      // Legacy behavior: allow Second Full House if data is corrupted
      return true;
    }

    // Step 5: Check if this ticket already won Full House
    const alreadyWonFullHouse = fullHouseWinners.some(winner => winner.ticketId === ticket.ticketId);

    if (alreadyWonFullHouse) {
      return false;
    }

    // Step 6: Success!
    // Log removed for performance
    return true;

  } catch (error) {
    return false;
  }
};


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

    // ✅ FIXED: Handle special prize validation
    if (prizeId === 'halfSheet') {
      const halfSheetWinners = validateHalfSheetTraditional(tickets, calledNumbers);
      for (const [winnerKey, winData] of Object.entries(halfSheetWinners)) {
        // Extract player name from winner key (format: "PlayerName_Set1_First" or "John_Smith_Set1_First")
        let playerName: string;

        if (FEATURE_FLAGS.USE_FIXED_NAME_PARSING) {
          // FIXED: Split only on "_Set" to preserve names with underscores like "John_Smith"
          const setIndex = winnerKey.indexOf('_Set');
          playerName = setIndex > 0 ? winnerKey.substring(0, setIndex) : winnerKey.split('_')[0];
        } else {
          // Legacy behavior (buggy for names with underscores)
          playerName = winnerKey.split('_')[0];
        }

        const setInfo = winnerKey.includes('_First') ? 'First Half' : 'Second Half';

        prizeWinners.push({
          name: `${playerName} (Set ${winData.setId} - ${setInfo})`,
          ticketId: winData.ticketIds.join(','),
          phone: tickets[winData.ticketIds[0]]?.playerPhone
        });
      }
    } else if (prizeId === 'fullSheet') {
      const fullSheetWinners = validateFullSheetTraditional(tickets, calledNumbers);
      for (const [playerName, winData] of Object.entries(fullSheetWinners)) {
        prizeWinners.push({
          name: playerName,
          ticketId: winData.ticketIds.join(','),
          phone: tickets[winData.ticketIds[0]]?.playerPhone
        });
      }
    } else {
      // Standard ticket-by-ticket validation
      for (const [ticketId, ticket] of Object.entries(tickets)) {
        if (!ticket.isBooked) continue;

        let hasWon = false;

        try {
          switch (prizeId) {
            case 'earlyFive':
              hasWon = validateEarlyFive(ticket, calledNumbers);
              break;

            case 'fullHouse':
              const allNumbers = ticket.metadata?.allNumbers || computeTicketMetadata(ticket).allNumbers;
              hasWon = allNumbers.every(num => calledNumbers.includes(num));
              break;
            case 'secondFullHouse':
              hasWon = validateSecondFullHouse(ticket, calledNumbers, prizes);
              break;

            case 'corners':
              const corners = getTicketCorners(ticket);
              hasWon = corners.every(corner => calledNumbers.includes(corner));
              break;

            case 'starCorner':
              const starCorners = getStarCorners(ticket);
              hasWon = starCorners.every(corner => calledNumbers.includes(corner));
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
              continue;
          }
        } catch (error) {
          hasWon = false;
        }

        if (hasWon) {
          // Log removed for performance
          prizeWinners.push({
            name: ticket.playerName,
            ticketId: ticket.ticketId,
            phone: ticket.playerPhone
          });
        } else if (prizeId === 'secondFullHouse') {
        }
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
  }

  return { winners };
};

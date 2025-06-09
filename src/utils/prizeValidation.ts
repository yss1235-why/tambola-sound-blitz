// src/utils/prizeValidation.ts - Prize Validation Utilities
import { TambolaTicket, Prize } from '@/services/firebase';

export interface PrizeValidationResult {
  prizeId: string;
  prizeName: string;
  winners: Array<{
    ticketId: string;
    playerName: string;
    playerPhone?: string;
    completedPattern: boolean;
  }>;
  winningNumber?: number;
}

export interface PrizeStatistics {
  totalPrizes: number;
  wonPrizes: number;
  totalWinners: number;
  prizeProgress: { [prizeId: string]: PrizeProgress };
}

export interface PrizeProgress {
  prizeId: string;
  prizeName: string;
  totalPlayers: number;
  playersClose: number; // Players who are 80%+ complete
  averageProgress: number; // Average completion percentage
  bestProgress: number; // Best completion percentage
}

export interface TicketProgress {
  ticketId: string;
  playerName: string;
  totalNumbers: number;
  markedNumbers: number;
  completionPercentage: number;
  nearMisses: string[]; // Patterns they're close to completing
}

/**
 * Validate all tickets for prize completion based on called numbers
 */
export function validateAllTicketsForPrizes(
  tickets: { [key: string]: TambolaTicket },
  calledNumbers: number[],
  prizes: { [key: string]: Prize }
): PrizeValidationResult[] {
  const results: PrizeValidationResult[] = [];
  const bookedTickets = Object.values(tickets).filter(ticket => ticket.isBooked);

  for (const [prizeId, prize] of Object.entries(prizes)) {
    if (prize.won) continue; // Skip already won prizes

    const winners: PrizeValidationResult['winners'] = [];

    for (const ticket of bookedTickets) {
      const isWinner = checkTicketForPrize(ticket, calledNumbers, prize);
      if (isWinner) {
        winners.push({
          ticketId: ticket.ticketId,
          playerName: ticket.playerName || 'Unknown Player',
          playerPhone: ticket.playerPhone,
          completedPattern: true
        });
      }
    }

    if (winners.length > 0) {
      results.push({
        prizeId,
        prizeName: prize.name,
        winners,
        winningNumber: calledNumbers[calledNumbers.length - 1] // Last called number
      });
    }
  }

  return results;
}

/**
 * Check if a ticket has won a specific prize
 */
function checkTicketForPrize(
  ticket: TambolaTicket,
  calledNumbers: number[],
  prize: Prize
): boolean {
  const calledSet = new Set(calledNumbers);

  switch (prize.id) {
    case 'quickFive':
      return checkQuickFive(ticket, calledSet);
    case 'topLine':
      return checkTopLine(ticket, calledSet);
    case 'middleLine':
      return checkMiddleLine(ticket, calledSet);
    case 'bottomLine':
      return checkBottomLine(ticket, calledSet);
    case 'fourCorners':
      return checkFourCorners(ticket, calledSet);
    case 'fullHouse':
      return checkFullHouse(ticket, calledSet);
    default:
      return false;
  }
}

/**
 * Check Quick Five - Any 5 numbers on the ticket
 */
function checkQuickFive(ticket: TambolaTicket, calledNumbers: Set<number>): boolean {
  let markedCount = 0;
  for (const row of ticket.rows) {
    for (const number of row) {
      if (number !== 0 && calledNumbers.has(number)) {
        markedCount++;
        if (markedCount >= 5) return true;
      }
    }
  }
  return false;
}

/**
 * Check Top Line - Complete first row
 */
function checkTopLine(ticket: TambolaTicket, calledNumbers: Set<number>): boolean {
  if (ticket.rows.length === 0) return false;
  const topRow = ticket.rows[0];
  
  for (const number of topRow) {
    if (number !== 0 && !calledNumbers.has(number)) {
      return false;
    }
  }
  return true;
}

/**
 * Check Middle Line - Complete second row
 */
function checkMiddleLine(ticket: TambolaTicket, calledNumbers: Set<number>): boolean {
  if (ticket.rows.length < 2) return false;
  const middleRow = ticket.rows[1];
  
  for (const number of middleRow) {
    if (number !== 0 && !calledNumbers.has(number)) {
      return false;
    }
  }
  return true;
}

/**
 * Check Bottom Line - Complete third row
 */
function checkBottomLine(ticket: TambolaTicket, calledNumbers: Set<number>): boolean {
  if (ticket.rows.length < 3) return false;
  const bottomRow = ticket.rows[2];
  
  for (const number of bottomRow) {
    if (number !== 0 && !calledNumbers.has(number)) {
      return false;
    }
  }
  return true;
}

/**
 * Check Four Corners - All four corner numbers
 */
function checkFourCorners(ticket: TambolaTicket, calledNumbers: Set<number>): boolean {
  if (ticket.rows.length < 3) return false;

  // Get corner positions
  const topRow = ticket.rows[0];
  const bottomRow = ticket.rows[2];
  
  // Find first and last non-zero numbers in top and bottom rows
  const topLeft = topRow.find(num => num !== 0);
  const topRight = topRow.slice().reverse().find(num => num !== 0);
  const bottomLeft = bottomRow.find(num => num !== 0);
  const bottomRight = bottomRow.slice().reverse().find(num => num !== 0);

  const corners = [topLeft, topRight, bottomLeft, bottomRight].filter(num => num !== undefined);
  
  return corners.length === 4 && corners.every(corner => calledNumbers.has(corner!));
}

/**
 * Check Full House - Complete ticket
 */
function checkFullHouse(ticket: TambolaTicket, calledNumbers: Set<number>): boolean {
  for (const row of ticket.rows) {
    for (const number of row) {
      if (number !== 0 && !calledNumbers.has(number)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Get comprehensive prize statistics
 */
export function getPrizeStatistics(
  tickets: { [key: string]: TambolaTicket },
  calledNumbers: number[],
  prizes: { [key: string]: Prize }
): PrizeStatistics {
  const bookedTickets = Object.values(tickets).filter(ticket => ticket.isBooked);
  const totalPrizes = Object.keys(prizes).length;
  const wonPrizes = Object.values(prizes).filter(p => p.won).length;
  const totalWinners = Object.values(prizes).reduce((sum, prize) => 
    sum + (prize.winners?.length || 0), 0
  );

  const prizeProgress: { [prizeId: string]: PrizeProgress } = {};

  for (const [prizeId, prize] of Object.entries(prizes)) {
    const progress = calculatePrizeProgress(bookedTickets, calledNumbers, prize);
    prizeProgress[prizeId] = progress;
  }

  return {
    totalPrizes,
    wonPrizes,
    totalWinners,
    prizeProgress
  };
}

/**
 * Calculate progress for a specific prize
 */
function calculatePrizeProgress(
  tickets: TambolaTicket[],
  calledNumbers: number[],
  prize: Prize
): PrizeProgress {
  const calledSet = new Set(calledNumbers);
  const progressData: number[] = [];
  let playersClose = 0;

  for (const ticket of tickets) {
    const progress = calculateTicketProgressForPrize(ticket, calledSet, prize);
    progressData.push(progress);
    
    if (progress >= 80) {
      playersClose++;
    }
  }

  const averageProgress = progressData.length > 0 
    ? Math.round(progressData.reduce((sum, p) => sum + p, 0) / progressData.length)
    : 0;
  
  const bestProgress = progressData.length > 0 
    ? Math.max(...progressData)
    : 0;

  return {
    prizeId: prize.id,
    prizeName: prize.name,
    totalPlayers: tickets.length,
    playersClose,
    averageProgress,
    bestProgress
  };
}

/**
 * Calculate ticket progress percentage for a specific prize
 */
function calculateTicketProgressForPrize(
  ticket: TambolaTicket,
  calledNumbers: Set<number>,
  prize: Prize
): number {
  switch (prize.id) {
    case 'quickFive':
      return calculateQuickFiveProgress(ticket, calledNumbers);
    case 'topLine':
      return calculateLineProgress(ticket.rows[0] || [], calledNumbers);
    case 'middleLine':
      return calculateLineProgress(ticket.rows[1] || [], calledNumbers);
    case 'bottomLine':
      return calculateLineProgress(ticket.rows[2] || [], calledNumbers);
    case 'fourCorners':
      return calculateFourCornersProgress(ticket, calledNumbers);
    case 'fullHouse':
      return calculateFullHouseProgress(ticket, calledNumbers);
    default:
      return 0;
  }
}

function calculateQuickFiveProgress(ticket: TambolaTicket, calledNumbers: Set<number>): number {
  let markedCount = 0;
  for (const row of ticket.rows) {
    for (const number of row) {
      if (number !== 0 && calledNumbers.has(number)) {
        markedCount++;
      }
    }
  }
  return Math.min(100, (markedCount / 5) * 100);
}

function calculateLineProgress(row: number[], calledNumbers: Set<number>): number {
  const validNumbers = row.filter(num => num !== 0);
  if (validNumbers.length === 0) return 0;
  
  const markedCount = validNumbers.filter(num => calledNumbers.has(num)).length;
  return Math.round((markedCount / validNumbers.length) * 100);
}

function calculateFourCornersProgress(ticket: TambolaTicket, calledNumbers: Set<number>): number {
  if (ticket.rows.length < 3) return 0;

  const topRow = ticket.rows[0];
  const bottomRow = ticket.rows[2];
  
  const topLeft = topRow.find(num => num !== 0);
  const topRight = topRow.slice().reverse().find(num => num !== 0);
  const bottomLeft = bottomRow.find(num => num !== 0);
  const bottomRight = bottomRow.slice().reverse().find(num => num !== 0);

  const corners = [topLeft, topRight, bottomLeft, bottomRight].filter(num => num !== undefined);
  if (corners.length === 0) return 0;
  
  const markedCorners = corners.filter(corner => calledNumbers.has(corner!)).length;
  return Math.round((markedCorners / corners.length) * 100);
}

function calculateFullHouseProgress(ticket: TambolaTicket, calledNumbers: Set<number>): number {
  let totalNumbers = 0;
  let markedNumbers = 0;
  
  for (const row of ticket.rows) {
    for (const number of row) {
      if (number !== 0) {
        totalNumbers++;
        if (calledNumbers.has(number)) {
          markedNumbers++;
        }
      }
    }
  }
  
  return totalNumbers > 0 ? Math.round((markedNumbers / totalNumbers) * 100) : 0;
}

/**
 * Get detailed progress for all tickets
 */
export function getTicketProgress(
  tickets: { [key: string]: TambolaTicket },
  calledNumbers: number[]
): TicketProgress[] {
  const bookedTickets = Object.values(tickets).filter(ticket => ticket.isBooked);
  const calledSet = new Set(calledNumbers);
  
  return bookedTickets.map(ticket => {
    let totalNumbers = 0;
    let markedNumbers = 0;
    
    for (const row of ticket.rows) {
      for (const number of row) {
        if (number !== 0) {
          totalNumbers++;
          if (calledSet.has(number)) {
            markedNumbers++;
          }
        }
      }
    }
    
    const completionPercentage = totalNumbers > 0 
      ? Math.round((markedNumbers / totalNumbers) * 100) 
      : 0;

    // Calculate near misses (patterns close to completion)
    const nearMisses: string[] = [];
    
    // Check how close to completing each line
    if (ticket.rows.length >= 1) {
      const topLineProgress = calculateLineProgress(ticket.rows[0], calledSet);
      if (topLineProgress >= 80 && topLineProgress < 100) {
        nearMisses.push('Top Line');
      }
    }
    
    if (ticket.rows.length >= 2) {
      const middleLineProgress = calculateLineProgress(ticket.rows[1], calledSet);
      if (middleLineProgress >= 80 && middleLineProgress < 100) {
        nearMisses.push('Middle Line');
      }
    }
    
    if (ticket.rows.length >= 3) {
      const bottomLineProgress = calculateLineProgress(ticket.rows[2], calledSet);
      if (bottomLineProgress >= 80 && bottomLineProgress < 100) {
        nearMisses.push('Bottom Line');
      }
    }

    // Check four corners progress
    const cornersProgress = calculateFourCornersProgress(ticket, calledSet);
    if (cornersProgress >= 75 && cornersProgress < 100) {
      nearMisses.push('Four Corners');
    }

    // Check full house progress
    if (completionPercentage >= 90 && completionPercentage < 100) {
      nearMisses.push('Full House');
    }

    return {
      ticketId: ticket.ticketId,
      playerName: ticket.playerName || 'Unknown Player',
      totalNumbers,
      markedNumbers,
      completionPercentage,
      nearMisses
    };
  });
}

/**
 * Check if any new winners should be announced for recent number calls
 */
export function checkForNewWinners(
  tickets: { [key: string]: TambolaTicket },
  calledNumbers: number[],
  prizes: { [key: string]: Prize },
  lastCheckedNumber?: number
): PrizeValidationResult[] {
  // Only check tickets with recent number calls if lastCheckedNumber is provided
  const numbersToCheck = lastCheckedNumber 
    ? calledNumbers.slice(calledNumbers.indexOf(lastCheckedNumber) + 1)
    : calledNumbers;

  if (numbersToCheck.length === 0) return [];

  return validateAllTicketsForPrizes(tickets, calledNumbers, prizes);
}

/**
 * Format prize announcement for winners
 */
export function formatPrizeAnnouncement(result: PrizeValidationResult): string {
  if (result.winners.length === 1) {
    const winner = result.winners[0];
    return `🎉 ${result.prizeName} won by ${winner.playerName} (Ticket ${winner.ticketId})!`;
  } else if (result.winners.length > 1) {
    const winnerNames = result.winners.map(w => `${w.playerName} (T${w.ticketId})`).join(', ');
    return `🎉 ${result.prizeName} won by ${result.winners.length} players: ${winnerNames}!`;
  }
  return `🎉 ${result.prizeName} has been won!`;
}

/**
 * Validate if a manual prize award is valid
 */
export function validateManualAward(
  ticketId: string,
  tickets: { [key: string]: TambolaTicket },
  calledNumbers: number[],
  prize: Prize
): { valid: boolean; reason?: string } {
  const ticket = tickets[ticketId];
  
  if (!ticket) {
    return { valid: false, reason: 'Ticket not found' };
  }
  
  if (!ticket.isBooked) {
    return { valid: false, reason: 'Ticket is not booked' };
  }
  
  // Check if ticket actually qualifies for the prize
  const calledSet = new Set(calledNumbers);
  const qualifies = checkTicketForPrize(ticket, calledNumbers, prize);
  
  if (!qualifies) {
    return { 
      valid: false, 
      reason: `Ticket ${ticketId} does not meet the requirements for ${prize.name}` 
    };
  }
  
  return { valid: true };
}

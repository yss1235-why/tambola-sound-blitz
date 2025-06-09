// src/utils/numberManagement.ts - Manual Number Management for Hosts
import { firebaseService } from '@/services/firebase';

export interface NumberManagementOptions {
  gameId: string;
  allowUndo?: boolean;
  requireConfirmation?: boolean;
}

export class NumberManager {
  private gameId: string;
  private options: NumberManagementOptions;

  constructor(options: NumberManagementOptions) {
    this.gameId = options.gameId;
    this.options = options;
  }

  /**
   * Manually add a number to the called numbers list
   * This is for host manual control only
   */
  async addNumberManually(number: number): Promise<boolean> {
    try {
      // Validate number range
      if (number < 1 || number > 90) {
        throw new Error('Number must be between 1 and 90');
      }

      // Get current game state
      const gameRef = await firebaseService.subscribeToGame(this.gameId, () => {});
      
      // Add the number using the existing service method
      await firebaseService.addCalledNumber(this.gameId, number);
      
      console.log(`✅ Manually added number: ${number}`);
      return true;
    } catch (error: any) {
      console.error('❌ Error manually adding number:', error);
      throw new Error(`Failed to add number ${number}: ${error.message}`);
    }
  }

  /**
   * Remove a number from called numbers (undo functionality)
   * Use with caution - this should be rare
   */
  async removeNumberManually(number: number): Promise<boolean> {
    try {
      if (!this.options.allowUndo) {
        throw new Error('Undo functionality is not enabled');
      }

      // This would require a custom Firebase function to remove from array
      // For now, we'll implement it by getting the current array and filtering
      const gameSnapshot = await firebaseService.subscribeToGame(this.gameId, () => {});
      
      // Note: This is a simplified implementation
      // In production, you'd want more sophisticated undo management
      console.log(`⚠️ Manual number removal requested for: ${number}`);
      console.log('This feature requires additional implementation for safety');
      
      return false;
    } catch (error: any) {
      console.error('❌ Error manually removing number:', error);
      throw new Error(`Failed to remove number ${number}: ${error.message}`);
    }
  }

  /**
   * Validate if a number can be called
   */
  validateNumberCall(number: number, calledNumbers: number[]): {
    valid: boolean;
    reason?: string;
  } {
    if (number < 1 || number > 90) {
      return { valid: false, reason: 'Number must be between 1 and 90' };
    }

    if (calledNumbers.includes(number)) {
      return { valid: false, reason: 'Number has already been called' };
    }

    return { valid: true };
  }

  /**
   * Get next suggested numbers based on game strategy
   */
  getSuggestedNumbers(calledNumbers: number[], count: number = 5): number[] {
    const availableNumbers = Array.from({ length: 90 }, (_, i) => i + 1)
      .filter(num => !calledNumbers.includes(num));

    // Simple random selection - could be enhanced with game strategy
    const suggested: number[] = [];
    const shuffled = [...availableNumbers].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < Math.min(count, shuffled.length); i++) {
      suggested.push(shuffled[i]);
    }

    return suggested.sort((a, b) => a - b);
  }

  /**
   * Get number distribution statistics
   */
  getNumberStatistics(calledNumbers: number[]): {
    totalCalled: number;
    remaining: number;
    percentage: number;
    distribution: { [key: string]: number };
  } {
    const distribution: { [key: string]: number } = {
      '1-10': 0,
      '11-20': 0,
      '21-30': 0,
      '31-40': 0,
      '41-50': 0,
      '51-60': 0,
      '61-70': 0,
      '71-80': 0,
      '81-90': 0
    };

    calledNumbers.forEach(num => {
      if (num <= 10) distribution['1-10']++;
      else if (num <= 20) distribution['11-20']++;
      else if (num <= 30) distribution['21-30']++;
      else if (num <= 40) distribution['31-40']++;
      else if (num <= 50) distribution['41-50']++;
      else if (num <= 60) distribution['51-60']++;
      else if (num <= 70) distribution['61-70']++;
      else if (num <= 80) distribution['71-80']++;
      else distribution['81-90']++;
    });

    return {
      totalCalled: calledNumbers.length,
      remaining: 90 - calledNumbers.length,
      percentage: Math.round((calledNumbers.length / 90) * 100),
      distribution
    };
  }
}

// Utility functions for number management
export const numberUtils = {
  /**
   * Format number for display with traditional Tambola calls
   */
  formatNumberCall: (number: number): string => {
    const traditionalCalls: { [key: number]: string } = {
      1: "Kelly's Eyes",
      2: "One Little Duck",
      3: "Cup of Tea",
      4: "Knock at the Door",
      5: "Man Alive",
      6: "Half a Dozen",
      7: "Lucky Seven",
      8: "Garden Gate",
      9: "Doctor's Orders",
      10: "Uncle Ben",
      11: "Legs Eleven",
      12: "One Dozen",
      13: "Unlucky for Some",
      14: "Valentine's Day",
      15: "Young and Keen",
      16: "Sweet Sixteen",
      17: "Dancing Queen",
      18: "Now You Can Vote",
      19: "Goodbye Teens",
      20: "One Score",
      21: "Key of the Door",
      22: "Two Little Ducks",
      30: "Dirty Thirty",
      44: "Droopy Drawers",
      45: "Halfway There",
      50: "Half a Century",
      55: "Snakes Alive",
      66: "Clickety Click",
      77: "Sunset Strip",
      88: "Two Fat Ladies",
      90: "Top of the Shop"
    };

    const call = traditionalCalls[number];
    return call ? `${call} - ${number}` : `Number ${number}`;
  },

  /**
   * Check if number follows a pattern (for debugging)
   */
  checkNumberPattern: (calledNumbers: number[]): {
    hasPattern: boolean;
    patternType?: string;
    confidence: number;
  } => {
    // Simple pattern detection - could be enhanced
    const sorted = [...calledNumbers].sort((a, b) => a - b);
    
    // Check for sequential pattern
    let sequential = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i-1] + 1) {
        sequential++;
      }
    }

    const sequentialPercentage = (sequential / (sorted.length - 1)) * 100;

    if (sequentialPercentage > 60) {
      return {
        hasPattern: true,
        patternType: 'sequential',
        confidence: sequentialPercentage
      };
    }

    return {
      hasPattern: false,
      confidence: 0
    };
  },

  /**
   * Generate number grid layout data for UI
   */
  generateGridLayout: (calledNumbers: number[], currentNumber: number | null) => {
    const grid: Array<Array<{
      number: number;
      isCalled: boolean;
      isCurrent: boolean;
      displayClass: string;
    }>> = [];

    let currentNum = 1;
    for (let row = 0; row < 9; row++) {
      const gridRow = [];
      for (let col = 0; col < 10; col++) {
        const isCalled = calledNumbers.includes(currentNum);
        const isCurrent = currentNumber === currentNum;
        
        let displayClass = 'number-cell';
        if (isCurrent) displayClass += ' current';
        else if (isCalled) displayClass += ' called';

        gridRow.push({
          number: currentNum,
          isCalled,
          isCurrent,
          displayClass
        });
        currentNum++;
      }
      grid.push(gridRow);
    }

    return grid;
  }
};

// Export singleton instance for easy use
export const createNumberManager = (options: NumberManagementOptions) => {
  return new NumberManager(options);
};

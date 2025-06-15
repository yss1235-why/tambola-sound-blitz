// src/services/firebase.ts - Optimized booking methods only (partial file)

// Add this optimized batch booking method to the FirebaseService class:

class FirebaseService {
  // ... existing code ...

  // OPTIMIZED: Batch book multiple tickets at once
  async bookTicketsBatch(
    ticketIds: string[], 
    playerName: string, 
    playerPhone: string, 
    gameId: string
  ): Promise<void> {
    try {
      const bookingData = removeUndefinedValues({
        isBooked: true,
        playerName: playerName.trim(),
        playerPhone: playerPhone.trim() || null,
        bookedAt: new Date().toISOString()
      });

      // Create batch update object
      const updates: { [key: string]: any } = {};
      
      // Prepare all updates
      ticketIds.forEach(ticketId => {
        updates[`games/${gameId}/tickets/${ticketId}`] = {
          ...bookingData,
          ticketId // Ensure ticketId is preserved
        };
      });

      // Execute all updates in a single operation
      await update(ref(database), updates);
      
    } catch (error: any) {
      console.error('Batch book tickets error:', error);
      throw new Error(error.message || 'Failed to book tickets');
    }
  }

  // OPTIMIZED: Book ticket without loading entire ticket set
  async bookTicket(ticketId: string, playerName: string, playerPhone: string, gameId: string): Promise<void> {
    try {
      const ticketRef = ref(database, `games/${gameId}/tickets/${ticketId}`);
      
      // First check if ticket exists and is available
      const ticketSnapshot = await get(ticketRef);
      if (!ticketSnapshot.exists()) {
        throw new Error(`Ticket ${ticketId} does not exist`);
      }
      
      const ticketData = ticketSnapshot.val();
      if (ticketData.isBooked) {
        throw new Error(`Ticket ${ticketId} is already booked`);
      }
      
      // Update only the booking fields
      const bookingData = removeUndefinedValues({
        isBooked: true,
        playerName: playerName.trim(),
        playerPhone: playerPhone.trim() || null,
        bookedAt: new Date().toISOString()
      });

      // Use update instead of set to avoid overwriting ticket data
      await update(ticketRef, bookingData);
    } catch (error: any) {
      console.error('Book ticket error:', error);
      throw new Error(error.message || 'Failed to book ticket');
    }
  }

  // ... rest of existing code ...
}

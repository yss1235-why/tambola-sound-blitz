// src/components/TicketManagementGrid.tsx - VERIFIED: Compatible with simple numeric ticket IDs + EXPANSION-ONLY Implementation

import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Ticket, 
  Users, 
  Phone, 
  Edit, 
  Trash2, 
  UserPlus,
  CheckSquare
} from 'lucide-react';
import { GameData, TambolaTicket, firebaseService } from '@/services/firebase';

interface TicketManagementGridProps {
  gameData: GameData;
  onRefreshGame: () => void;
}

interface BookingForm {
  playerName: string;
  playerPhone: string;
}

interface TicketInfo {
  ticketId: string;
  isBooked: boolean;
  playerName?: string;
  playerPhone?: string;
  bookedAt?: string;
}

export const TicketManagementGrid: React.FC<TicketManagementGridProps> = ({ 
  gameData
}) => {
  const [selectedTickets, setSelectedTickets] = useState<string[]>([]);
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingTicket, setEditingTicket] = useState<TicketInfo | null>(null);
  const [isBooking, setIsBooking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false); // ✅ NEW: Track expansion state
  
  const [bookingForm, setBookingForm] = useState<BookingForm>({
    playerName: '',
    playerPhone: ''
  });

  const [editForm, setEditForm] = useState<BookingForm>({
    playerName: '',
    playerPhone: ''
  });

  // ✅ NEW: Detect when tickets are being expanded
  useEffect(() => {
    const currentTicketCount = Object.keys(gameData.tickets || {}).length;
    const expectedTicketCount = gameData.maxTickets;
    
    // If ticket count doesn't match maxTickets, expansion might be in progress
    const isExpansionInProgress = currentTicketCount < expectedTicketCount;
    setIsExpanding(isExpansionInProgress);
    
    if (isExpansionInProgress) {
      console.log(`📈 Ticket expansion detected: have ${currentTicketCount}, expect ${expectedTicketCount}`);
    } else if (currentTicketCount === expectedTicketCount && isExpanding) {
      console.log(`✅ Ticket expansion completed: ${currentTicketCount} tickets loaded`);
    }
  }, [gameData.tickets, gameData.maxTickets, isExpanding]);

  // ✅ VERIFIED: Generate ticket info with simple numeric IDs (1, 2, 3...)
  const ticketInfo = useMemo(() => {
    const info: TicketInfo[] = [];
    const tickets = gameData.tickets || {};
    
    for (let i = 1; i <= gameData.maxTickets; i++) {
      const ticketId = i.toString(); // ✅ Simple numeric format matches creation
      const ticket = tickets[ticketId];
      
      info.push({
        ticketId,
        isBooked: ticket?.isBooked || false,
        playerName: ticket?.playerName,
        playerPhone: ticket?.playerPhone,
        bookedAt: ticket?.bookedAt
      });
    }
    
    console.log(`🎫 Generated ticket info for ${info.length} tickets with IDs: ${info.slice(0, 5).map(t => t.ticketId).join(', ')}...`);
    return info;
  }, [gameData.tickets, gameData.maxTickets]);

  // Calculate counts
  const bookedCount = ticketInfo.filter(t => t.isBooked).length;
  const availableCount = gameData.maxTickets - bookedCount;

  const handleTicketClick = (ticketId: string, isBooked: boolean) => {
    console.log(`🖱️ Ticket clicked: ${ticketId} (booked: ${isBooked})`);
    
    if (isBooked) {
      // If ticket is booked, open edit dialog
      const ticket = ticketInfo.find(t => t.ticketId === ticketId);
      if (ticket) {
        setEditingTicket(ticket);
        setEditForm({
          playerName: ticket.playerName || '',
          playerPhone: ticket.playerPhone || ''
        });
        setShowEditDialog(true);
      }
    } else {
      // If ticket is available, toggle selection
      setSelectedTickets(prev => 
        prev.includes(ticketId) 
          ? prev.filter(id => id !== ticketId)
          : [...prev, ticketId]
      );
    }
  };

  const handleBookSelectedTickets = async () => {
    if (selectedTickets.length === 0 || !bookingForm.playerName.trim()) {
      alert('Please select tickets and enter player name');
      return;
    }

    setIsBooking(true);
    try {
      // Book each selected ticket
      for (const ticketId of selectedTickets) {
        await firebaseService.bookTicket(
          ticketId,
          bookingForm.playerName.trim(),
          bookingForm.playerPhone.trim(),
          gameData.gameId
        );
      }
      
      console.log(`✅ Booked ${selectedTickets.length} tickets for ${bookingForm.playerName}`);
      
      // Reset state
      setSelectedTickets([]);
      setBookingForm({ playerName: '', playerPhone: '' });
      setShowBookingDialog(false);
      
    } catch (error: any) {
      console.error('Booking error:', error);
      alert(error.message || 'Failed to book tickets');
    } finally {
      setIsBooking(false);
    }
  };

  const handleEditTicket = async () => {
    if (!editingTicket || !editForm.playerName.trim()) {
      alert('Please enter player name');
      return;
    }

    setIsUpdating(true);
    try {
      await firebaseService.updateTicket(gameData.gameId, editingTicket.ticketId, {
        playerName: editForm.playerName.trim(),
        playerPhone: editForm.playerPhone.trim()
      });
      
      console.log(`✅ Updated ticket ${editingTicket.ticketId}`);
      setShowEditDialog(false);
      setEditingTicket(null);
      setEditForm({ playerName: '', playerPhone: '' });
      
    } catch (error: any) {
      console.error('Update error:', error);
      alert(error.message || 'Failed to update ticket');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUnbookTicket = async (ticketId: string) => {
    const confirmed = window.confirm(`Are you sure you want to unbook ticket ${ticketId}?`);
    if (!confirmed) return;

    setIsUpdating(true);
    try {
      await firebaseService.unbookTicket(gameData.gameId, ticketId);
      console.log(`✅ Unbooked ticket ${ticketId}`);
      setShowEditDialog(false);
      setEditingTicket(null);
    } catch (error: any) {
      console.error('Unbook error:', error);
      alert(error.message || 'Failed to unbook ticket');
    } finally {
      setIsUpdating(false);
    }
  };

  const selectAllAvailable = () => {
    const availableTickets = ticketInfo
      .filter(t => !t.isBooked)
      .map(t => t.ticketId);
    setSelectedTickets(availableTickets);
  };

  const deselectAll = () => {
    setSelectedTickets([]);
  };

  // ✅ PERFORMANCE: Create ticket rows efficiently
  const ticketRows = useMemo(() => {
    const rows: TicketInfo[][] = [];
    for (let i = 0; i < ticketInfo.length; i += 10) {
      rows.push(ticketInfo.slice(i, i + 10));
    }
    return rows;
  }, [ticketInfo]);

  const getTicketClassName = (ticket: TicketInfo) => {
    const baseClasses = "w-full h-12 sm:h-14 border-2 rounded-lg cursor-pointer transition-all duration-200 text-xs sm:text-sm font-medium flex items-center justify-center";
    
    if (ticket.isBooked) {
      return `${baseClasses} bg-green-500 border-green-600 text-white hover:bg-green-600`;
    } else if (selectedTickets.includes(ticket.ticketId)) {
      return `${baseClasses} bg-blue-500 border-blue-600 text-white hover:bg-blue-600`;
    } else {
      return `${baseClasses} bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400`;
    }
  };

  return (
    <div className="space-y-6">
      {/* ✅ LOADING OVERLAY - Updated to include expansion state */}
      {(isBooking || isUpdating || isExpanding) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 flex items-center space-x-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="font-medium">
              {isBooking ? 'Booking...' : isUpdating ? 'Updating...' : 'Expanding tickets...'}
            </span>
          </div>
        </div>
      )}

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="w-5 h-5" />
            <span>Booking Summary</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{gameData.maxTickets}</div>
              <div className="text-sm text-blue-700">Total Tickets</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{bookedCount}</div>
              <div className="text-sm text-green-700">Booked</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-600">{availableCount}</div>
              <div className="text-sm text-gray-700">Available</div>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{selectedTickets.length}</div>
              <div className="text-sm text-orange-700">Selected</div>
            </div>
          </div>

          {/* Selection Controls */}
          <div className="flex flex-wrap gap-3 mb-4">
            <Button
              onClick={() => setShowBookingDialog(true)}
              disabled={selectedTickets.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Book Selected ({selectedTickets.length})
            </Button>

            <Button
              onClick={selectedTickets.length === availableCount ? deselectAll : selectAllAvailable}
              variant="outline"
              disabled={availableCount === 0}
            >
              <CheckSquare className="w-4 h-4 mr-2" />
              {selectedTickets.length === availableCount ? 'Deselect All' : 'Select All Available'}
            </Button>

            {selectedTickets.length > 0 && (
              <Button 
                onClick={() => setSelectedTickets([])}
                variant="outline"
              >
                Clear Selection
              </Button>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 mb-6 text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-gray-100 border-2 border-gray-300 rounded"></div>
              <span>Available</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-blue-500 border-2 border-blue-600 rounded"></div>
              <span>Selected</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-green-500 border-2 border-green-600 rounded"></div>
              <span>Booked</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tickets Grid */}
      <Card>
        <CardHeader>
          <CardTitle>
            Tickets Grid - Simple Numeric IDs ({ticketInfo.length} tickets)
          </CardTitle>
          <p className="text-sm text-gray-600">
            ✅ Using standardized format: Ticket 1, Ticket 2, Ticket 3...
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 sm:space-y-3">
            {ticketRows.map((row, rowIndex) => (
              <div key={rowIndex} className="grid grid-cols-10 gap-1 sm:gap-2">
                {row.map((ticket) => (
                  <div
                    key={ticket.ticketId}
                    className={getTicketClassName(ticket)}
                    onClick={() => handleTicketClick(ticket.ticketId, ticket.isBooked)}
                    title={`Ticket ${ticket.ticketId}${ticket.isBooked ? ` - ${ticket.playerName}` : ' - Available'}`}
                  >
                    {ticket.ticketId}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Book Selected Tickets Dialog */}
      <Dialog open={showBookingDialog} onOpenChange={setShowBookingDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Book {selectedTickets.length} Ticket(s)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                Selected Tickets: {selectedTickets.slice(0, 10).join(', ')}
                {selectedTickets.length > 10 && ` ... and ${selectedTickets.length - 10} more`}
              </p>
            </div>
            
            <div>
              <Label htmlFor="player-name">Player Name *</Label>
              <Input
                id="player-name"
                placeholder="Enter player's name"
                value={bookingForm.playerName}
                onChange={(e) => setBookingForm(prev => ({ ...prev, playerName: e.target.value }))}
                className="border-2 border-gray-200 focus:border-blue-400"
                disabled={isBooking}
              />
            </div>
            
            <div>
              <Label htmlFor="player-phone">Player Phone (Optional)</Label>
              <Input
                id="player-phone"
                placeholder="Enter player's phone number"
                value={bookingForm.playerPhone}
                onChange={(e) => setBookingForm(prev => ({ ...prev, playerPhone: e.target.value }))}
                className="border-2 border-gray-200 focus:border-blue-400"
                disabled={isBooking}
              />
            </div>

            <div className="flex space-x-2">
              <Button
                onClick={handleBookSelectedTickets}
                disabled={isBooking || !bookingForm.playerName.trim()}
                className="flex-1"
              >
                {isBooking ? 'Booking...' : `Book ${selectedTickets.length} Ticket(s)`}
              </Button>
              <Button
                onClick={() => setShowBookingDialog(false)}
                variant="outline"
                disabled={isBooking}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Ticket Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Ticket {editingTicket?.ticketId}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-player-name">Player Name *</Label>
              <Input
                id="edit-player-name"
                placeholder="Enter player's name"
                value={editForm.playerName}
                onChange={(e) => setEditForm(prev => ({ ...prev, playerName: e.target.value }))}
                className="border-2 border-gray-200 focus:border-blue-400"
                disabled={isUpdating}
              />
            </div>
            
            <div>
              <Label htmlFor="edit-player-phone">Player Phone (Optional)</Label>
              <Input
                id="edit-player-phone"
                placeholder="Enter player's phone number"
                value={editForm.playerPhone}
                onChange={(e) => setEditForm(prev => ({ ...prev, playerPhone: e.target.value }))}
                className="border-2 border-gray-200 focus:border-blue-400"
                disabled={isUpdating}
              />
            </div>

            <div className="flex space-x-2">
              <Button
                onClick={handleEditTicket}
                disabled={isUpdating || !editForm.playerName.trim()}
                className="flex-1"
              >
                {isUpdating ? 'Updating...' : 'Update Ticket'}
              </Button>
              <Button
                onClick={() => setShowEditDialog(false)}
                variant="outline"
                disabled={isUpdating}
              >
                Cancel
              </Button>
            </div>

            {editingTicket && (
              <div className="pt-4 border-t">
                <Button
                  onClick={() => handleUnbookTicket(editingTicket.ticketId)}
                  variant="destructive"
                  disabled={isUpdating}
                  className="w-full"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {isUpdating ? 'Unbooking...' : 'Unbook Ticket'}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

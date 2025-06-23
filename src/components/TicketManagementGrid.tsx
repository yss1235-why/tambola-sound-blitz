// src/components/TicketManagementGrid.tsx - MOBILE 6-COLUMN FIX: Optimized for 3-digit numbers

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
  gameData,
  onRefreshGame
}) => {
  const [selectedTickets, setSelectedTickets] = useState<string[]>([]);
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingTicket, setEditingTicket] = useState<TicketInfo | null>(null);
  const [isBooking, setIsBooking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);
  
  const [bookingForm, setBookingForm] = useState<BookingForm>({
    playerName: '',
    playerPhone: ''
  });

  const [editForm, setEditForm] = useState<BookingForm>({
    playerName: '',
    playerPhone: ''
  });

  // Detect when tickets are being expanded
  useEffect(() => {
    const currentTicketCount = Object.keys(gameData.tickets || {}).length;
    const expectedTicketCount = gameData.maxTickets;
    
    if (currentTicketCount > 0 && currentTicketCount < expectedTicketCount) {
      setIsExpanding(true);
    } else {
      setIsExpanding(false);
    }
  }, [gameData.tickets, gameData.maxTickets]);

  // Generate ticket information
  const ticketInfo = useMemo(() => {
    const tickets: TicketInfo[] = [];
    
    for (let i = 1; i <= gameData.maxTickets; i++) {
      const ticketId = i.toString();
      const ticket = gameData.tickets?.[ticketId];
      
      tickets.push({
        ticketId,
        isBooked: ticket?.isBooked || false,
        playerName: ticket?.playerName,
        playerPhone: ticket?.playerPhone,
        bookedAt: ticket?.bookedAt
      });
    }
    
    return tickets;
  }, [gameData.tickets, gameData.maxTickets]);

  const bookedCount = ticketInfo.filter(t => t.isBooked).length;
  const availableCount = ticketInfo.length - bookedCount;

  // UPDATED: Create 6-column rows instead of 10-column
  const ticketRows = useMemo(() => {
    const rows: TicketInfo[][] = [];
    for (let i = 0; i < ticketInfo.length; i += 6) {
      rows.push(ticketInfo.slice(i, i + 6));
    }
    return rows;
  }, [ticketInfo]);

  const handleTicketClick = (ticketId: string, isBooked: boolean) => {
    if (isBooked) {
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
      setSelectedTickets(prev => 
        prev.includes(ticketId) 
          ? prev.filter(id => id !== ticketId)
          : [...prev, ticketId]
      );
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

  const handleBookTickets = async () => {
    if (selectedTickets.length === 0 || !bookingForm.playerName.trim()) return;

    setIsBooking(true);
    try {
      for (const ticketId of selectedTickets) {
        await firebaseService.bookTicket(
          ticketId,
          bookingForm.playerName.trim(),
          bookingForm.playerPhone.trim(),
          gameData.gameId
        );
      }

      setSelectedTickets([]);
      setBookingForm({ playerName: '', playerPhone: '' });
      setShowBookingDialog(false);
      onRefreshGame();
    } catch (error) {
      console.error('Error booking tickets:', error);
    } finally {
      setIsBooking(false);
    }
  };

  const handleUpdateTicket = async () => {
    if (!editingTicket || !editForm.playerName.trim()) return;

    setIsUpdating(true);
    try {
      await firebaseService.bookTicket(
        editingTicket.ticketId,
        editForm.playerName.trim(),
        editForm.playerPhone.trim(),
        gameData.gameId
      );

      setEditingTicket(null);
      setEditForm({ playerName: '', playerPhone: '' });
      setShowEditDialog(false);
      onRefreshGame();
    } catch (error) {
      console.error('Error updating ticket:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancelBooking = async (ticketId: string) => {
    setIsUpdating(true);
    try {
      await firebaseService.unbookTicket(gameData.gameId, ticketId);
      setEditingTicket(null);
      setShowEditDialog(false);
      onRefreshGame();
    } catch (error) {
      console.error('Error canceling booking:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  // UPDATED: Mobile-optimized cell styling for 3-digit numbers with monospace font
  const getTicketClassName = (ticket: TicketInfo) => {
    const baseClasses = "w-full h-16 border-2 rounded-lg cursor-pointer transition-all duration-200 font-mono font-bold text-base flex items-center justify-center min-w-[70px]";
    
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
      {/* Loading Overlay */}
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

      {/* UPDATED: 6-Column Tickets Grid for Mobile */}
      <Card>
        <CardHeader>
          <CardTitle>
            Tickets Grid - 6 Column Mobile Layout ({ticketInfo.length} tickets)
          </CardTitle>
          <p className="text-sm text-gray-600">
            ✅ Optimized for mobile with consistent 3-digit number spacing
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {ticketRows.map((row, rowIndex) => (
              <div key={rowIndex} className="grid grid-cols-6 gap-5 sm:gap-2">
                {row.map((ticket) => (
                  <div
                    key={ticket.ticketId}
                    className={getTicketClassName(ticket)}
                    onClick={() => handleTicketClick(ticket.ticketId, ticket.isBooked)}
                    title={`Ticket ${ticket.ticketId}${ticket.isBooked ? ` - ${ticket.playerName}` : ''}`}
                  >
                    {ticket.ticketId}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Booking Dialog */}
      <Dialog open={showBookingDialog} onOpenChange={setShowBookingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Book Selected Tickets</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-2">
                Booking {selectedTickets.length} tickets: {selectedTickets.join(', ')}
              </p>
            </div>
            <div>
              <Label htmlFor="playerName">Player Name *</Label>
              <Input
                id="playerName"
                value={bookingForm.playerName}
                onChange={(e) => setBookingForm(prev => ({ ...prev, playerName: e.target.value }))}
                placeholder="Enter player name"
              />
            </div>
            <div>
              <Label htmlFor="playerPhone">Phone Number</Label>
              <Input
                id="playerPhone"
                value={bookingForm.playerPhone}
                onChange={(e) => setBookingForm(prev => ({ ...prev, playerPhone: e.target.value }))}
                placeholder="Enter phone number (optional)"
              />
            </div>
            <div className="flex space-x-3 pt-4">
              <Button 
                onClick={handleBookTickets}
                disabled={!bookingForm.playerName.trim() || isBooking}
                className="flex-1"
              >
                {isBooking ? 'Booking...' : 'Book Tickets'}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setShowBookingDialog(false)}
                disabled={isBooking}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Edit Ticket {editingTicket?.ticketId}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="editPlayerName">Player Name *</Label>
              <Input
                id="editPlayerName"
                value={editForm.playerName}
                onChange={(e) => setEditForm(prev => ({ ...prev, playerName: e.target.value }))}
                placeholder="Enter player name"
              />
            </div>
            <div>
              <Label htmlFor="editPlayerPhone">Phone Number</Label>
              <Input
                id="editPlayerPhone"
                value={editForm.playerPhone}
                onChange={(e) => setEditForm(prev => ({ ...prev, playerPhone: e.target.value }))}
                placeholder="Enter phone number (optional)"
              />
            </div>
            <div className="flex space-x-3 pt-4">
              <Button 
                onClick={handleUpdateTicket}
                disabled={!editForm.playerName.trim() || isUpdating}
                className="flex-1"
              >
                {isUpdating ? 'Updating...' : 'Update Ticket'}
              </Button>
              <Button 
                variant="destructive"
                onClick={() => editingTicket && handleCancelBooking(editingTicket.ticketId)}
                disabled={isUpdating}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Cancel Booking
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setShowEditDialog(false)}
                disabled={isUpdating}
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

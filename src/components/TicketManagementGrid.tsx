// src/components/TicketManagementGrid.tsx - MOBILE 6-COLUMN FIX: Optimized for 3-digit numbers + FLOATING BOOKING SUMMARY

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
  CheckSquare,
  X
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
    if (!editingTicket) return;

    setIsUpdating(true);
    try {
      await firebaseService.updateTicketInfo(
        gameData.gameId,
        editingTicket.ticketId,
        editForm.playerName.trim(),
        editForm.playerPhone.trim()
      );

      setShowEditDialog(false);
      setEditingTicket(null);
      setEditForm({ playerName: '', playerPhone: '' });
      onRefreshGame();
    } catch (error) {
      console.error('Error updating ticket:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancelBooking = async (ticketId: string) => {
    if (!confirm('Are you sure you want to cancel this booking?')) return;

    try {
      await firebaseService.unbookTicket(gameData.gameId, ticketId);
      onRefreshGame();
    } catch (error) {
      console.error('Error canceling booking:', error);
    }
  };

  const expandTickets = async () => {
    setIsExpanding(true);
    try {
      await firebaseService.expandGameTickets(gameData.gameId, gameData.maxTickets);
      onRefreshGame();
    } catch (error) {
      console.error('Error expanding tickets:', error);
    } finally {
      setIsExpanding(false);
    }
  };

  // Clear selection when component unmounts or game changes
  useEffect(() => {
    return () => {
      setSelectedTickets([]);
    };
  }, [gameData.gameId]);

  return (
    <div className="space-y-6 relative">
      {/* Loading State */}
      {(isBooking || isUpdating || isExpanding) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 flex items-center space-x-3">
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

            <Button
              onClick={deselectAll}
              variant="outline"
              disabled={selectedTickets.length === 0}
            >
              Clear Selection
            </Button>
          </div>

          {(Object.keys(gameData.tickets || {}).length < gameData.maxTickets) && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-yellow-800">
                    Ticket Expansion Available
                  </p>
                  <p className="text-xs text-yellow-700">
                    Current: {Object.keys(gameData.tickets || {}).length} / {gameData.maxTickets} tickets
                  </p>
                </div>
                <Button
                  onClick={expandTickets}
                  disabled={isExpanding}
                  size="sm"
                  className="bg-yellow-600 hover:bg-yellow-700 text-white"
                >
                  {isExpanding ? 'Expanding...' : 'Expand Tickets'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tickets Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Ticket className="w-5 h-5" />
            <span>Tickets ({gameData.maxTickets})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {ticketRows.map((row, rowIndex) => (
              <div key={rowIndex} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                {row.map((ticket) => (
                  <div
                    key={ticket.ticketId}
                    onClick={() => handleTicketClick(ticket.ticketId, ticket.isBooked)}
                    className={`
                      relative border-2 rounded-lg p-3 cursor-pointer transition-all duration-200
                      ${ticket.isBooked 
                        ? 'border-green-300 bg-green-50' 
                        : selectedTickets.includes(ticket.ticketId)
                          ? 'border-orange-400 bg-orange-50'
                          : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50'
                      }
                    `}
                  >
                    <div className="text-center">
                      <div className="font-bold text-lg mb-1">#{ticket.ticketId}</div>
                      
                      {ticket.isBooked ? (
                        <div>
                          <div className="text-sm font-medium text-green-700 mb-1">
                            {ticket.playerName}
                          </div>
                          {ticket.playerPhone && (
                            <div className="text-xs text-green-600 flex items-center justify-center space-x-1">
                              <Phone className="w-3 h-3" />
                              <span>{ticket.playerPhone}</span>
                            </div>
                          )}
                          <div className="flex justify-center space-x-1 mt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTicketClick(ticket.ticketId, true);
                              }}
                              className="text-xs px-2 py-1"
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelBooking(ticket.ticketId);
                              }}
                              className="text-xs px-2 py-1 text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <Badge variant="outline" className="text-xs">
                            Available
                          </Badge>
                          {selectedTickets.includes(ticket.ticketId) && (
                            <div className="mt-1">
                              <Badge className="bg-orange-500 text-white text-xs">
                                Selected
                              </Badge>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 🆕 FLOATING BOOKING SUMMARY - Mobile Responsive */}
      {selectedTickets.length > 0 && (
        <div className="fixed bottom-4 left-4 sm:bottom-6 sm:left-6 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-4 max-w-xs sm:max-w-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium text-sm">
              {selectedTickets.length} ticket{selectedTickets.length > 1 ? 's' : ''} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={deselectAll}
              className="h-6 w-6 p-0 hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="space-y-3">
            <div>
              <input
                type="text"
                placeholder="Player Name *"
                value={bookingForm.playerName}
                onChange={(e) => setBookingForm(prev => ({ ...prev, playerName: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <input
                type="text"
                placeholder="Phone Number (optional)"
                value={bookingForm.playerPhone}
                onChange={(e) => setBookingForm(prev => ({ ...prev, playerPhone: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <Button
              onClick={handleBookTickets}
              disabled={!bookingForm.playerName.trim() || isBooking}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              {isBooking ? 'Booking...' : `Book ${selectedTickets.length} Ticket${selectedTickets.length > 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      )}

      {/* Booking Dialog (Existing - kept as backup) */}
      <Dialog open={showBookingDialog} onOpenChange={setShowBookingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Book Selected Tickets</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="playerName">Player Name *</Label>
              <Input
                id="playerName"
                value={bookingForm.playerName}
                onChange={(e) => setBookingForm(prev => ({ ...prev, playerName: e.target.value }))}
                placeholder="Enter player name"
                required
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
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-sm font-medium">Selected Tickets:</p>
              <p className="text-sm text-gray-600">
                {selectedTickets.map(id => `#${id}`).join(', ')}
              </p>
            </div>
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => setShowBookingDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleBookTickets}
                disabled={!bookingForm.playerName.trim() || isBooking}
              >
                {isBooking ? 'Booking...' : `Book ${selectedTickets.length} Tickets`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Ticket #{editingTicket?.ticketId}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="editPlayerName">Player Name</Label>
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
                placeholder="Enter phone number"
              />
            </div>
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => setShowEditDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdateTicket}
                disabled={isUpdating}
              >
                {isUpdating ? 'Updating...' : 'Update Ticket'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

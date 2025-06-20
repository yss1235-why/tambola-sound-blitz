// src/components/TicketManagementGrid.tsx - VERIFIED: Compatible with simple numeric ticket IDs
import React, { useState, useMemo } from 'react';
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
  
  const [bookingForm, setBookingForm] = useState<BookingForm>({
    playerName: '',
    playerPhone: ''
  });

  const [editForm, setEditForm] = useState<BookingForm>({
    playerName: '',
    playerPhone: ''
  });

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

  const handleSelectAll = () => {
    const availableTickets = ticketInfo
      .filter(t => !t.isBooked)
      .map(t => t.ticketId);
    
    if (selectedTickets.length === availableTickets.length) {
      setSelectedTickets([]);
    } else {
      setSelectedTickets(availableTickets);
    }
  };

  const handleBookTickets = async () => {
    if (selectedTickets.length === 0) {
      alert('Please select at least one ticket to book');
      return;
    }

    if (!bookingForm.playerName.trim()) {
      alert('Please enter the player\'s name');
      return;
    }

    if (isBooking) return; // Prevent double booking

    setIsBooking(true);
    try {
      console.log(`🎫 Booking tickets: ${selectedTickets.join(', ')} for ${bookingForm.playerName}`);
      
      // Book all tickets in parallel for better performance
      const bookingPromises = selectedTickets.map(ticketId => 
        firebaseService.bookTicket(
          ticketId, 
          bookingForm.playerName.trim(), 
          bookingForm.playerPhone.trim(), 
          gameData.gameId
        )
      );

      await Promise.all(bookingPromises);

      console.log(`✅ Successfully booked ${selectedTickets.length} tickets`);

      // Reset form and selections
      setSelectedTickets([]);
      setBookingForm({ playerName: '', playerPhone: '' });
      setShowBookingDialog(false);
      
      // Firebase subscription will handle the update automatically

    } catch (error: any) {
      console.error('❌ Error booking tickets:', error);
      alert(error.message || 'Failed to book tickets');
    } finally {
      setIsBooking(false);
    }
  };

  const handleEditTicket = async () => {
    if (!editingTicket) return;

    if (!editForm.playerName.trim()) {
      alert('Please enter the player\'s name');
      return;
    }

    if (isUpdating) return; // Prevent double updates

    setIsUpdating(true);
    try {
      console.log(`✏️ Updating ticket ${editingTicket.ticketId} for ${editForm.playerName}`);
      
      await firebaseService.updateTicket(
        gameData.gameId,
        editingTicket.ticketId,
        {
          playerName: editForm.playerName.trim(),
          playerPhone: editForm.playerPhone.trim(),
          isBooked: true
        }
      );

      console.log(`✅ Ticket ${editingTicket.ticketId} updated successfully`);

      setShowEditDialog(false);
      setEditingTicket(null);
      setEditForm({ playerName: '', playerPhone: '' });
      
      // Firebase subscription will handle the update automatically

    } catch (error: any) {
      console.error('❌ Error updating ticket:', error);
      alert(error.message || 'Failed to update ticket');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancelBooking = async (ticketId: string) => {
    const confirmed = window.confirm('Are you sure you want to cancel this booking?');
    if (!confirmed) return;

    try {
      console.log(`🗑️ Cancelling booking for ticket ${ticketId}`);
      await firebaseService.unbookTicket(gameData.gameId, ticketId);
      console.log(`✅ Booking cancelled for ticket ${ticketId}`);
      // Firebase subscription will handle the update automatically
    } catch (error: any) {
      console.error('❌ Error cancelling booking:', error);
      alert(error.message || 'Failed to cancel booking');
    }
  };

  const getTicketClassName = (ticket: TicketInfo) => {
    const baseClass = "relative w-full aspect-square rounded-md sm:rounded-lg border-2 transition-all duration-200 flex items-center justify-center font-bold cursor-pointer";
    
    if (ticket.isBooked) {
      return `${baseClass} bg-green-500 border-green-600 text-white hover:bg-green-600`;
    } else if (selectedTickets.includes(ticket.ticketId)) {
      return `${baseClass} bg-blue-500 border-blue-600 text-white shadow-lg`;
    } else {
      return `${baseClass} bg-gray-100 border-gray-300 hover:border-blue-400 hover:bg-blue-100 text-gray-800`;
    }
  };

  // Create rows of 10 tickets each
  const ticketRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < ticketInfo.length; i += 10) {
      rows.push(ticketInfo.slice(i, i + 10));
    }
    return rows;
  }, [ticketInfo]);

  return (
    <div className="space-y-6">
      {/* Game Info and Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Ticket className="w-6 h-6 mr-2" />
              Ticket Management: {gameData.name}
            </div>
            <Badge variant={gameData.gameState.isActive ? "default" : "secondary"}>
              {gameData.gameState.isActive ? "Game Active" : "Game Waiting"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{gameData.maxTickets}</div>
              <div className="text-sm text-blue-700">Total Tickets</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{bookedCount}</div>
              <div className="text-sm text-green-700">Booked</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-600">{availableCount}</div>
              <div className="text-sm text-gray-700">Available</div>
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">{selectedTickets.length}</div>
              <div className="text-sm text-yellow-700">Selected</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 mb-6">
            {selectedTickets.length > 0 && (
              <Button 
                onClick={() => setShowBookingDialog(true)}
                className="bg-green-600 hover:bg-green-700"
                disabled={isBooking}
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Book {selectedTickets.length} Ticket(s)
              </Button>
            )}
            
            <Button 
              onClick={handleSelectAll}
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
                    <span className="text-lg sm:text-xl lg:text-2xl font-bold">{ticket.ticketId}</span>
                  </div>
                ))}
                {/* Fill empty slots in the last row */}
                {row.length < 10 && 
                  Array.from({ length: 10 - row.length }).map((_, index) => (
                    <div key={`empty-${rowIndex}-${index}`} className="w-full aspect-square"></div>
                  ))
                }
              </div>
            ))}
          </div>

          {ticketInfo.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Ticket className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>No tickets available for this game</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Booked Tickets Summary */}
      {bookedCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className="w-5 h-5 mr-2" />
              Booked Tickets Summary ({bookedCount})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {ticketInfo.filter(t => t.isBooked).map((ticket) => (
                <Card key={ticket.ticketId} className="border-green-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center mb-2">
                          <Ticket className="w-4 h-4 mr-2 text-green-600" />
                          <span className="font-bold text-green-800">Ticket {ticket.ticketId}</span>
                        </div>
                        <p className="text-sm text-gray-700 mb-1">
                          <strong>Player:</strong> {ticket.playerName}
                        </p>
                        {ticket.playerPhone && (
                          <p className="text-sm text-gray-600 flex items-center">
                            <Phone className="w-3 h-3 mr-1" />
                            {ticket.playerPhone}
                          </p>
                        )}
                      </div>
                      <div className="flex space-x-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTicketClick(ticket.ticketId, true)}
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCancelBooking(ticket.ticketId)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Book Tickets Dialog */}
      <Dialog open={showBookingDialog} onOpenChange={setShowBookingDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Book {selectedTickets.length} Ticket(s)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Selected Tickets:</strong> {selectedTickets.join(', ')}
              </p>
              <p className="text-xs text-blue-600 mt-1">
                ✅ Simple numeric format - matches user expectations
              </p>
            </div>
            
            <div>
              <Label htmlFor="player-name">Player Name *</Label>
              <Input
                id="player-name"
                placeholder="Enter player's name"
                value={bookingForm.playerName}
                onChange={(e) => setBookingForm(prev => ({ ...prev, playerName: e.target.value }))}
                className="border-2 border-gray-200 focus:border-blue-400 text-white"
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
                className="border-2 border-gray-200 focus:border-blue-400 text-white"
                disabled={isBooking}
              />
            </div>

            <div className="flex space-x-2">
              <Button
                onClick={handleBookTickets}
                disabled={isBooking || !bookingForm.playerName.trim()}
                className="flex-1 bg-green-600 hover:bg-green-700"
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

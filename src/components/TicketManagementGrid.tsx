// src/components/TicketManagementGrid.tsx - Ticket Management for Hosts
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { 
  Ticket, 
  Users, 
  Phone, 
  Edit, 
  Trash2, 
  UserPlus,
  CheckSquare,
  Square,
  User
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
  const [isLoading, setIsLoading] = useState(false);
  const [tickets, setTickets] = useState<{ [key: string]: TambolaTicket }>({});
  
  const [bookingForm, setBookingForm] = useState<BookingForm>({
    playerName: '',
    playerPhone: ''
  });

  const [editForm, setEditForm] = useState<BookingForm>({
    playerName: '',
    playerPhone: ''
  });

  const { toast } = useToast();

  // Subscribe to real-time ticket updates
  useEffect(() => {
    if (gameData.tickets) {
      setTickets(gameData.tickets);
    }

    const unsubscribe = firebaseService.subscribeToTickets(gameData.gameId, (updatedTickets) => {
      if (updatedTickets) {
        setTickets(updatedTickets);
      }
    });

    return unsubscribe;
  }, [gameData.gameId, gameData.tickets]);

  // Generate ticket info for the grid (up to maxTickets)
  const getTicketInfo = (): TicketInfo[] => {
    const ticketInfo: TicketInfo[] = [];
    
    for (let i = 1; i <= gameData.maxTickets; i++) {
      const ticketId = i.toString();
      const ticket = tickets[ticketId];
      
      ticketInfo.push({
        ticketId,
        isBooked: ticket?.isBooked || false,
        playerName: ticket?.playerName,
        playerPhone: ticket?.playerPhone,
        bookedAt: ticket?.bookedAt
      });
    }
    
    return ticketInfo;
  };

  const ticketInfo = getTicketInfo();
  const bookedCount = ticketInfo.filter(t => t.isBooked).length;
  const availableCount = gameData.maxTickets - bookedCount;

  const handleTicketClick = (ticketId: string, isBooked: boolean) => {
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
      toast({
        title: "No Tickets Selected",
        description: "Please select at least one ticket to book",
        variant: "destructive",
      });
      return;
    }

    if (!bookingForm.playerName.trim()) {
      toast({
        title: "Player Name Required",
        description: "Please enter the player's name",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Book all selected tickets for the same player
      for (const ticketId of selectedTickets) {
        await firebaseService.bookTicket(
          ticketId, 
          bookingForm.playerName.trim(), 
          bookingForm.playerPhone.trim(), 
          gameData.gameId
        );
      }

      toast({
        title: "Tickets Booked Successfully!",
        description: `${selectedTickets.length} ticket(s) booked for ${bookingForm.playerName}`,
      });

      // Reset form and selections
      setSelectedTickets([]);
      setBookingForm({ playerName: '', playerPhone: '' });
      setShowBookingDialog(false);
      onRefreshGame();

    } catch (error: any) {
      console.error('Error booking tickets:', error);
      toast({
        title: "Booking Failed",
        description: error.message || "Failed to book tickets",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditTicket = async () => {
    if (!editingTicket) return;

    if (!editForm.playerName.trim()) {
      toast({
        title: "Player Name Required",
        description: "Please enter the player's name",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Update the ticket with new player information
      await firebaseService.bookTicket(
        editingTicket.ticketId,
        editForm.playerName.trim(),
        editForm.playerPhone.trim(),
        gameData.gameId
      );

      toast({
        title: "Ticket Updated",
        description: `Ticket ${editingTicket.ticketId} updated successfully`,
      });

      setShowEditDialog(false);
      setEditingTicket(null);
      setEditForm({ playerName: '', playerPhone: '' });
      onRefreshGame();

    } catch (error: any) {
      console.error('Error updating ticket:', error);
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update ticket",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelBooking = async (ticketId: string) => {
    const confirmed = window.confirm('Are you sure you want to cancel this booking?');
    if (!confirmed) return;

    setIsLoading(true);
    try {
      await firebaseService.unbookTicket(gameData.gameId, ticketId);
      
      toast({
        title: "Booking Cancelled",
        description: `Ticket ${ticketId} booking has been cancelled`,
      });

      onRefreshGame();
    } catch (error: any) {
      console.error('Error cancelling booking:', error);
      toast({
        title: "Cancellation Failed",
        description: error.message || "Failed to cancel booking",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getTicketClassName = (ticket: TicketInfo) => {
    const baseClass = "relative w-full h-16 rounded-lg border-2 transition-all duration-200 flex flex-col items-center justify-center text-sm font-medium cursor-pointer";
    
    if (ticket.isBooked) {
      return `${baseClass} bg-green-50 border-green-300 hover:border-green-400 text-green-800`;
    } else if (selectedTickets.includes(ticket.ticketId)) {
      return `${baseClass} bg-blue-100 border-blue-400 text-blue-800 shadow-md`;
    } else {
      return `${baseClass} bg-white border-gray-300 hover:border-blue-400 hover:bg-blue-50 text-gray-700`;
    }
  };

  const renderTicketContent = (ticket: TicketInfo) => {
    if (ticket.isBooked) {
      return (
        <>
          <div className="flex items-center space-x-1">
            <User className="w-3 h-3" />
            <span className="font-bold">#{ticket.ticketId}</span>
          </div>
          <div className="text-xs text-center truncate w-full px-1">
            {ticket.playerName}
          </div>
          {ticket.playerPhone && (
            <div className="text-xs text-green-600 flex items-center">
              <Phone className="w-2 h-2 mr-1" />
              <span className="truncate">{ticket.playerPhone}</span>
            </div>
          )}
        </>
      );
    } else {
      return (
        <>
          <div className="flex items-center space-x-1">
            {selectedTickets.includes(ticket.ticketId) ? (
              <CheckSquare className="w-4 h-4 text-blue-600" />
            ) : (
              <Square className="w-4 h-4 text-gray-400" />
            )}
            <span className="font-bold text-lg">#{ticket.ticketId}</span>
          </div>
          <span className="text-xs text-gray-500">Available</span>
        </>
      );
    }
  };

  // Create rows of 10 tickets each
  const ticketRows = [];
  for (let i = 0; i < ticketInfo.length; i += 10) {
    ticketRows.push(ticketInfo.slice(i, i + 10));
  }

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
              <div className="w-4 h-4 bg-white border-2 border-gray-300 rounded"></div>
              <span>Available</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-blue-100 border-2 border-blue-400 rounded"></div>
              <span>Selected</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-green-50 border-2 border-green-300 rounded"></div>
              <span>Booked</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tickets Grid */}
      <Card>
        <CardHeader>
          <CardTitle>Tickets Grid (Click to select available tickets or edit booked ones)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {ticketRows.map((row, rowIndex) => (
              <div key={rowIndex} className="grid grid-cols-10 gap-2">
                {row.map((ticket) => (
                  <div
                    key={ticket.ticketId}
                    className={getTicketClassName(ticket)}
                    onClick={() => handleTicketClick(ticket.ticketId, ticket.isBooked)}
                  >
                    {renderTicketContent(ticket)}
                  </div>
                ))}
                {/* Fill empty slots in the last row */}
                {row.length < 10 && 
                  Array.from({ length: 10 - row.length }).map((_, index) => (
                    <div key={`empty-${rowIndex}-${index}`} className="w-full h-16"></div>
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

      {/* Booked Tickets Summary (if any) */}
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
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center mb-2">
                          <Ticket className="w-4 h-4 mr-2 text-green-600" />
                          <span className="font-bold text-green-800">Ticket #{ticket.ticketId}</span>
                        </div>
                        <p className="text-sm text-gray-700 mb-1">
                          <strong>Player:</strong> {ticket.playerName}
                        </p>
                        {ticket.playerPhone && (
                          <p className="text-sm text-gray-600 flex items-center mb-2">
                            <Phone className="w-3 h-3 mr-1" />
                            {ticket.playerPhone}
                          </p>
                        )}
                        {ticket.bookedAt && (
                          <p className="text-xs text-gray-500">
                            Booked: {new Date(ticket.bookedAt).toLocaleString()}
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
            </div>
            
            <div>
              <Label htmlFor="player-name">Player Name *</Label>
              <Input
                id="player-name"
                placeholder="Enter player's name"
                value={bookingForm.playerName}
                onChange={(e) => setBookingForm(prev => ({ ...prev, playerName: e.target.value }))}
                className="border-2 border-gray-200 focus:border-blue-400"
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
              />
            </div>

            <div className="flex space-x-2">
              <Button
                onClick={handleBookTickets}
                disabled={isLoading || !bookingForm.playerName.trim()}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {isLoading ? 'Booking...' : `Book ${selectedTickets.length} Ticket(s)`}
              </Button>
              <Button
                onClick={() => setShowBookingDialog(false)}
                variant="outline"
                disabled={isLoading}
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
            <DialogTitle>Edit Ticket #{editingTicket?.ticketId}</DialogTitle>
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
              />
            </div>

            <div className="flex space-x-2">
              <Button
                onClick={handleEditTicket}
                disabled={isLoading || !editForm.playerName.trim()}
                className="flex-1"
              >
                {isLoading ? 'Updating...' : 'Update Ticket'}
              </Button>
              <Button
                onClick={() => setShowEditDialog(false)}
                variant="outline"
                disabled={isLoading}
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

// src/components/TicketBookingGrid.tsx - Optimized booking speed & removed note
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Phone, User, Users, Loader2 } from 'lucide-react';
import { TambolaTicket, GameData, firebaseService } from '@/services/firebase';

interface TicketBookingGridProps {
  tickets: { [key: string]: TambolaTicket };
  gameData: GameData;
  onBookTicket: (ticketId: string, playerName: string, playerPhone: string) => Promise<void>;
  onGameStart: () => void;
}

export const TicketBookingGrid: React.FC<TicketBookingGridProps> = ({ 
  tickets, 
  gameData, 
  onBookTicket, 
  onGameStart 
}) => {
  const [hostPhone, setHostPhone] = useState<string>('');
  const [isLoadingHost, setIsLoadingHost] = useState(true);

  // Load host phone number
  useEffect(() => {
    const loadHostInfo = async () => {
      setIsLoadingHost(true);
      try {
        // First try to get phone from game data
        if (gameData.hostPhone) {
          setHostPhone(gameData.hostPhone);
        } else {
          // Fallback to host profile
          const host = await firebaseService.getHostById(gameData.hostId);
          if (host && host.phone) {
            setHostPhone(host.phone);
          }
        }
      } catch (error) {
        console.error('Error loading host info:', error);
      } finally {
        setIsLoadingHost(false);
      }
    };

    loadHostInfo();
  }, [gameData.hostId, gameData.hostPhone]);

  const handleBookTicket = (ticketId: string) => {
    const ticket = tickets[ticketId];
    if (!ticket || ticket.isBooked) return;

    if (!hostPhone) {
      alert('Host contact information not available. Please try again later.');
      return;
    }

    // Create simplified WhatsApp message with only ticket number
    const message = `Hi! I want to book Ticket ${ticketId}. Please confirm my booking.`;
    const whatsappUrl = `https://wa.me/${hostPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const bookedCount = Object.values(tickets).filter(t => t.isBooked).length;
  const totalCount = Math.min(gameData.maxTickets, Object.keys(tickets).length);
  const availableCount = totalCount - bookedCount;

  // Get only the tickets up to maxTickets limit
  const availableTickets = Object.entries(tickets)
    .slice(0, gameData.maxTickets)
    .reduce((acc, [ticketId, ticket]) => {
      acc[ticketId] = ticket;
      return acc;
    }, {} as { [key: string]: TambolaTicket });

  // Check if game should start (when enough tickets are booked or game is active)
  if (gameData.gameState.isActive) {
    onGameStart();
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Game Info Section */}
      <Card className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-orange-200">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl text-gray-800">
            {gameData.name}
          </CardTitle>
          <div className="flex justify-center items-center space-x-8 mt-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{bookedCount}</div>
              <div className="text-sm text-gray-600">Tickets Booked</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{availableCount}</div>
              <div className="text-sm text-gray-600">Available</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{totalCount}</div>
              <div className="text-sm text-gray-600">Max Tickets</div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Tickets Grid */}
      <Card className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-orange-200">
        <CardHeader>
          <CardTitle className="text-2xl text-gray-800 text-center">Available Tickets</CardTitle>
          <div className="text-center space-y-2">
            <p className="text-gray-600">Click on any available ticket to book via WhatsApp</p>
            {isLoadingHost ? (
              <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading host contact...</span>
              </div>
            ) : hostPhone ? (
              <p className="text-sm text-blue-600 flex items-center justify-center space-x-1">
                <Phone className="w-4 h-4" />
                <span>WhatsApp booking: +{hostPhone}</span>
              </p>
            ) : (
              <p className="text-sm text-red-600">
                Host contact information not available
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(availableTickets).map(([ticketId, ticket]) => (
              <div
                key={ticketId}
                className={`relative rounded-xl border-2 transition-all duration-200 ${
                  ticket.isBooked 
                    ? 'bg-gray-100 border-gray-300' 
                    : 'bg-white border-orange-200 hover:border-orange-400 hover:shadow-lg cursor-pointer'
                }`}
              >
                {/* Ticket Header */}
                <div className={`text-center py-3 rounded-t-xl ${
                  ticket.isBooked 
                    ? 'bg-gray-200 text-gray-600' 
                    : 'bg-gradient-to-r from-orange-500 to-red-500 text-white'
                }`}>
                  <h3 className="font-bold text-lg">Ticket {ticketId}</h3>
                  {ticket.isBooked && (
                    <p className="text-sm">Booked by {ticket.playerName}</p>
                  )}
                </div>

                {/* Ticket Grid */}
                <div className="p-4">
                  <div className="grid grid-cols-9 gap-1 mb-4">
                    {ticket.rows.flat().map((number, index) => (
                      <div
                        key={index}
                        className={`aspect-square flex items-center justify-center text-xs font-bold rounded ${
                          number === 0 
                            ? 'bg-gray-100' 
                            : ticket.isBooked 
                              ? 'bg-gray-300 text-gray-600' 
                              : 'bg-gradient-to-br from-orange-100 to-red-100 text-gray-800 border border-orange-200'
                        }`}
                      >
                        {number !== 0 ? number : ''}
                      </div>
                    ))}
                  </div>

                  {/* Booking Status / Button */}
                  {ticket.isBooked ? (
                    <div className="text-center">
                      <div className="flex items-center justify-center space-x-2 text-gray-600">
                        <User className="w-4 h-4" />
                        <span className="font-medium">{ticket.playerName}</span>
                      </div>
                      {ticket.playerPhone && (
                        <p className="text-xs text-gray-500 mt-1 flex items-center justify-center space-x-1">
                          <Phone className="w-3 h-3" />
                          <span>{ticket.playerPhone}</span>
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Button
                        onClick={() => handleBookTicket(ticketId)}
                        disabled={!hostPhone || isLoadingHost}
                        className="bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 w-full disabled:opacity-50"
                      >
                        <Phone className="w-4 h-4 mr-2" />
                        {isLoadingHost ? 'Loading...' : 'Book via WhatsApp'}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

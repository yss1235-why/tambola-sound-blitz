import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Phone } from 'lucide-react';

interface TicketBookingGridProps {
  playerName: string;
  onGameStart: () => void;
}

// Sample ticket data - in real app this would come from Firebase
const sampleTickets = [
  {
    ticketId: 1,
    rows: [
      [4, 11, 0, 32, 44, 0, 60, 0, 0],
      [8, 0, 21, 34, 47, 0, 0, 74, 0],
      [0, 14, 29, 0, 49, 55, 0, 0, 88]
    ],
    isBooked: false,
    playerName: '',
    playerPhone: ''
  },
  {
    ticketId: 2,
    rows: [
      [2, 0, 25, 0, 0, 52, 63, 0, 85],
      [0, 16, 0, 31, 0, 0, 67, 78, 0],
      [9, 0, 0, 35, 48, 0, 0, 79, 90]
    ],
    isBooked: true,
    playerName: 'John Doe',
    playerPhone: '+91 9876543210'
  },
  {
    ticketId: 3,
    rows: [
      [1, 0, 22, 0, 41, 0, 0, 73, 0],
      [0, 18, 0, 33, 0, 56, 64, 0, 87],
      [7, 0, 28, 0, 0, 58, 0, 0, 89]
    ],
    isBooked: false,
    playerName: '',
    playerPhone: ''
  },
  {
    ticketId: 4,
    rows: [
      [3, 0, 24, 0, 42, 0, 61, 0, 86],
      [0, 17, 0, 36, 0, 57, 0, 75, 0],
      [6, 0, 27, 0, 45, 0, 0, 0, 88]
    ],
    isBooked: true,
    playerName: 'Sarah Smith',
    playerPhone: '+91 9123456789'
  },
  {
    ticketId: 5,
    rows: [
      [5, 0, 23, 0, 43, 0, 62, 0, 87],
      [0, 19, 0, 37, 0, 58, 0, 76, 0],
      [9, 0, 26, 0, 46, 59, 0, 0, 89]
    ],
    isBooked: false,
    playerName: '',
    playerPhone: ''
  },
  {
    ticketId: 6,
    rows: [
      [1, 12, 0, 38, 0, 53, 0, 77, 0],
      [0, 0, 28, 0, 48, 0, 65, 0, 90],
      [10, 0, 0, 39, 0, 54, 0, 78, 0]
    ],
    isBooked: false,
    playerName: '',
    playerPhone: ''
  }
];

export const TicketBookingGrid: React.FC<TicketBookingGridProps> = ({ playerName, onGameStart }) => {
  const [tickets, setTickets] = useState(sampleTickets);
  const [gameStarted, setGameStarted] = useState(false);

  const handleBookTicket = (ticketId: number) => {
    const ticketNumbers = tickets
      .find(t => t.ticketId === ticketId)
      ?.rows.flat()
      .filter(num => num !== 0)
      .join(', ') || '';
    
    const message = `Hi! I want to book Ticket ${ticketId} for ${playerName}. Numbers: ${ticketNumbers}`;
    const whatsappUrl = `https://wa.me/919876543210?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const bookedCount = tickets.filter(t => t.isBooked).length;
  const totalCount = tickets.length;

  if (gameStarted) {
    onGameStart();
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section with booking info */}
      <Card className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-200 p-6">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl text-slate-800">
            🎲 Welcome to Tambola! 🎲
          </CardTitle>
          <p className="text-slate-600 mt-2">Book your tickets and get ready to play!</p>
          <p className="text-lg text-slate-700 mt-4 font-semibold">
            {bookedCount} of {totalCount} tickets booked
          </p>
        </CardHeader>
      </Card>

      {/* Tickets Grid */}
      <Card className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-200 p-6">
        <CardHeader>
          <CardTitle className="text-2xl text-slate-800 text-center">Available Tickets</CardTitle>
          <p className="text-slate-600 text-center">Click on any available ticket to book via WhatsApp</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tickets.map((ticket) => (
              <div
                key={ticket.ticketId}
                className={`relative rounded-xl border-2 transition-all duration-200 ${
                  ticket.isBooked 
                    ? 'bg-gray-100 border-gray-300' 
                    : 'bg-white border-slate-200 hover:border-slate-400 hover:shadow-lg'
                }`}
              >
                {/* Ticket Header */}
                <div className={`text-center py-3 rounded-t-xl ${
                  ticket.isBooked 
                    ? 'bg-gray-200 text-gray-600' 
                    : 'bg-gradient-to-r from-slate-600 to-slate-700 text-white'
                }`}>
                  <h3 className="font-bold text-lg">Ticket {ticket.ticketId}</h3>
                </div>

                {/* Ticket Grid */}
                <div className="p-4">
                  <div className="ticket-grid mb-4">
                    {ticket.rows.flat().map((number, index) => (
                      <div
                        key={index}
                        className={`ticket-cell ${
                          number === 0 
                            ? 'empty' 
                            : ticket.isBooked 
                              ? 'booked' 
                              : 'number'
                        }`}
                      >
                        {number !== 0 ? number : ''}
                      </div>
                    ))}
                  </div>

                  {/* Booking Status / Button */}
                  {ticket.isBooked ? (
                    <div className="text-center">
                      <p className="font-semibold text-gray-600">{ticket.playerName}</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <Button
                        onClick={() => handleBookTicket(ticket.ticketId)}
                        className="bg-gradient-to-r from-slate-600 to-slate-700 text-white px-4 py-2 rounded-lg
                                 font-semibold shadow-lg hover:from-slate-700 hover:to-slate-800
                                 transition-all duration-200 hover:scale-105 w-full"
                      >
                        <Phone className="w-4 h-4 mr-2" />
                        Book via WhatsApp
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

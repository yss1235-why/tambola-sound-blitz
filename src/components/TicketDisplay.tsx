// src/components/TicketDisplay.tsx - Updated with simple ticket naming
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TambolaTicket } from '@/services/firebase';

interface TicketDisplayProps {
  calledNumbers: number[];
  tickets?: TambolaTicket[];
}

export const TicketDisplay: React.FC<TicketDisplayProps> = ({ calledNumbers, tickets }) => {
  // Only show real tickets, no sample data
  if (!tickets || tickets.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-6xl mb-4">🎫</div>
        <p className="text-gray-600 text-lg">No tickets booked yet</p>
        <p className="text-gray-500 text-sm">Tickets will appear here once players book them</p>
      </div>
    );
  }
  
  const isNumberMarked = (number: number) => number !== 0 && calledNumbers.includes(number);
  const isEmpty = (number: number) => number === 0;

  const getCellStyle = (number: number) => {
    if (isEmpty(number)) {
      return 'ticket-cell empty';
    }
    if (isNumberMarked(number)) {
      return 'ticket-cell marked animate-bounce-in';
    }
    return 'ticket-cell number';
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {tickets.map((ticket) => (
        <Card key={ticket.ticketId} className="bg-white border-2 border-blue-200 shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="bg-gradient-to-r from-blue-500 to-purple-600 text-white text-center py-3">
            <CardTitle className="text-lg">Ticket {ticket.ticketId}</CardTitle>
            {ticket.isBooked && ticket.playerName && (
              <p className="text-blue-100 text-sm">Player: {ticket.playerName}</p>
            )}
          </CardHeader>
          <CardContent className="p-4">
            <div className="ticket-grid">
              {ticket.rows.flat().map((number, index) => (
                <div
                  key={index}
                  className={getCellStyle(number)}
                >
                  {number !== 0 ? number : ''}
                </div>
              ))}
            </div>
            <div className="mt-3 text-center">
              <div className="text-sm text-gray-600">
                Marked: {ticket.rows.flat().filter(num => isNumberMarked(num)).length} / {ticket.rows.flat().filter(num => num !== 0).length}
              </div>
              {ticket.isBooked && (
                <div className="text-xs text-green-600 mt-1 font-medium">
                  ✓ Booked
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

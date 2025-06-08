// src/components/TicketDisplay.tsx - Updated with simple ticket naming
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TambolaTicket } from '@/services/firebase';

interface TicketDisplayProps {
  calledNumbers: number[];
  tickets?: TambolaTicket[];
}

// Sample ticket data for demo purposes with simple naming
const sampleTickets = [
  {
    ticketId: '1',
    rows: [
      [4, 11, 0, 32, 44, 0, 60, 0, 0],
      [8, 0, 21, 34, 47, 0, 0, 74, 0],
      [0, 14, 29, 0, 49, 55, 0, 0, 88]
    ],
    isBooked: true,
    playerName: 'Sample Player 1',
    playerPhone: '9876543210'
  },
  {
    ticketId: '2',
    rows: [
      [2, 0, 25, 0, 0, 52, 63, 0, 85],
      [0, 16, 0, 31, 0, 0, 67, 78, 0],
      [9, 0, 0, 35, 48, 0, 0, 79, 90]
    ],
    isBooked: true,
    playerName: 'Sample Player 2',
    playerPhone: '9876543211'
  },
  {
    ticketId: '3',
    rows: [
      [1, 0, 22, 0, 41, 0, 0, 73, 0],
      [0, 18, 0, 33, 0, 56, 64, 0, 87],
      [7, 0, 28, 0, 0, 58, 0, 0, 89]
    ],
    isBooked: true,
    playerName: 'Sample Player 3',
    playerPhone: '9876543212'
  }
];

export const TicketDisplay: React.FC<TicketDisplayProps> = ({ calledNumbers, tickets }) => {
  const displayTickets = tickets && tickets.length > 0 ? tickets : sampleTickets;
  
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
      {displayTickets.map((ticket) => (
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

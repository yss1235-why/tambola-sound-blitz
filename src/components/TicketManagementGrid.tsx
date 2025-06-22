// src/components/TicketManagementGrid.tsx - COMPLETE: Expansion-Only Implementation

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Ticket,
  User,
  Phone,
  Calendar,
  Search,
  Filter,
  RefreshCw,
  Users,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Grid3X3,
  Eye,
  EyeOff,
  Download,
  SortAsc,
  SortDesc,
  Clock
} from 'lucide-react';
import { 
  firebaseService,
  GameData,
  TambolaTicket
} from '@/services/firebase';

interface TicketManagementGridProps {
  gameData: GameData;
  onRefreshGame: () => void;
}

interface BookingFormData {
  playerName: string;
  playerPhone: string;
}

interface TicketInfo {
  totalTickets: number;
  bookedTickets: number;
  availableTickets: number;
  recentBookings: TambolaTicket[];
  ticketStatusCounts: {
    available: number;
    booked: number;
  };
}

type SortOption = 'id' | 'name' | 'phone' | 'date';
type SortDirection = 'asc' | 'desc';
type FilterOption = 'all' | 'booked' | 'available';

export const TicketManagementGrid: React.FC<TicketManagementGridProps> = ({ 
  gameData, 
  onRefreshGame 
}) => {
  // ================== STATE MANAGEMENT ==================
  
  const [isBooking, setIsBooking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false); // ✅ NEW: Track expansion state
  
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [bookingForm, setBookingForm] = useState<BookingFormData>({
    playerName: '',
    playerPhone: ''
  });
  
  // Grid display options
  const [showGridView, setShowGridView] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterOption>('all');
  const [sortBy, setSortBy] = useState<SortOption>('id');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  
  // Pagination for grid view
  const [currentPage, setCurrentPage] = useState(1);
  const TICKETS_PER_PAGE = 50;

  // ================== TICKET INFO COMPUTATION ==================

  const ticketInfo = useMemo<TicketInfo>(() => {
    const tickets = gameData.tickets || {};
    const ticketValues = Object.values(tickets);
    
    const bookedTickets = ticketValues.filter(ticket => ticket.isBooked);
    const recentBookings = bookedTickets
      .filter(ticket => ticket.bookedAt)
      .sort((a, b) => new Date(b.bookedAt).getTime() - new Date(a.bookedAt).getTime())
      .slice(0, 5);

    return {
      totalTickets: gameData.maxTickets,
      bookedTickets: bookedTickets.length,
      availableTickets: gameData.maxTickets - bookedTickets.length,
      recentBookings,
      ticketStatusCounts: {
        available: gameData.maxTickets - bookedTickets.length,
        booked: bookedTickets.length
      }
    };
  }, [gameData.tickets, gameData.maxTickets]);

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

  // ================== FILTERED AND SORTED TICKETS ==================

  const filteredAndSortedTickets = useMemo(() => {
    const tickets = gameData.tickets || {};
    let ticketEntries = Object.entries(tickets);

    // Apply search filter
    if (searchTerm) {
      ticketEntries = ticketEntries.filter(([ticketId, ticket]) => {
        const searchLower = searchTerm.toLowerCase();
        return (
          ticketId.includes(searchLower) ||
          ticket.playerName.toLowerCase().includes(searchLower) ||
          ticket.playerPhone.includes(searchLower)
        );
      });
    }

    // Apply status filter
    if (filterStatus !== 'all') {
      ticketEntries = ticketEntries.filter(([_, ticket]) => {
        return filterStatus === 'booked' ? ticket.isBooked : !ticket.isBooked;
      });
    }

    // Apply sorting
    ticketEntries.sort(([idA, ticketA], [idB, ticketB]) => {
      let compareValue = 0;
      
      switch (sortBy) {
        case 'id':
          compareValue = parseInt(idA) - parseInt(idB);
          break;
        case 'name':
          compareValue = ticketA.playerName.localeCompare(ticketB.playerName);
          break;
        case 'phone':
          compareValue = ticketA.playerPhone.localeCompare(ticketB.playerPhone);
          break;
        case 'date':
          const dateA = ticketA.bookedAt ? new Date(ticketA.bookedAt).getTime() : 0;
          const dateB = ticketB.bookedAt ? new Date(ticketB.bookedAt).getTime() : 0;
          compareValue = dateA - dateB;
          break;
      }
      
      return sortDirection === 'asc' ? compareValue : -compareValue;
    });

    return ticketEntries;
  }, [gameData.tickets, searchTerm, filterStatus, sortBy, sortDirection]);

  // ================== PAGINATION ==================

  const paginatedTickets = useMemo(() => {
    const startIndex = (currentPage - 1) * TICKETS_PER_PAGE;
    const endIndex = startIndex + TICKETS_PER_PAGE;
    return filteredAndSortedTickets.slice(startIndex, endIndex);
  }, [filteredAndSortedTickets, currentPage]);

  const totalPages = Math.ceil(filteredAndSortedTickets.length / TICKETS_PER_PAGE);

  // ================== EVENT HANDLERS ==================

  const handleTicketClick = useCallback((ticketId: string, ticket: TambolaTicket) => {
    if (isBooking || isUpdating || isExpanding) return;
    
    setSelectedTicketId(ticketId);
    
    if (ticket.isBooked) {
      // Show ticket details for booked ticket
      setShowBookingForm(false);
    } else {
      // Show booking form for available ticket
      setBookingForm({
        playerName: '',
        playerPhone: ''
      });
      setShowBookingForm(true);
    }
  }, [isBooking, isUpdating, isExpanding]);

  const handleBookTicket = async () => {
    if (!selectedTicketId || !bookingForm.playerName.trim() || !bookingForm.playerPhone.trim()) {
      alert('Please fill in all fields');
      return;
    }

    setIsBooking(true);
    
    try {
      await firebaseService.bookTicket(
        selectedTicketId,
        bookingForm.playerName.trim(),
        bookingForm.playerPhone.trim(),
        gameData.gameId
      );
      
      console.log(`✅ Ticket ${selectedTicketId} booked successfully`);
      
      // Reset form and close
      setBookingForm({ playerName: '', playerPhone: '' });
      setShowBookingForm(false);
      setSelectedTicketId(null);
      
    } catch (error: any) {
      console.error('Booking error:', error);
      alert(error.message || 'Failed to book ticket');
    } finally {
      setIsBooking(false);
    }
  };

  const handleUnbookTicket = async (ticketId: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to unbook ticket ${ticketId}? This will make it available for other players.`
    );
    
    if (!confirmed) return;

    setIsUpdating(true);
    
    try {
      await firebaseService.unbookTicket(gameData.gameId, ticketId);
      console.log(`✅ Ticket ${ticketId} unbooked successfully`);
      
      if (selectedTicketId === ticketId) {
        setSelectedTicketId(null);
        setShowBookingForm(false);
      }
      
    } catch (error: any) {
      console.error('Unbook error:', error);
      alert(error.message || 'Failed to unbook ticket');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSortChange = (newSortBy: SortOption) => {
    if (sortBy === newSortBy) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortDirection('asc');
    }
  };

  const exportBookingData = () => {
    const bookedTickets = Object.entries(gameData.tickets || {})
      .filter(([_, ticket]) => ticket.isBooked)
      .map(([ticketId, ticket]) => ({
        'Ticket ID': ticketId,
        'Player Name': ticket.playerName,
        'Phone Number': ticket.playerPhone,
        'Booked At': new Date(ticket.bookedAt).toLocaleString()
      }));

    const csvContent = [
      Object.keys(bookedTickets[0] || {}).join(','),
      ...bookedTickets.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${gameData.name || 'tambola'}-bookings.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // ================== RENDER HELPERS ==================

  const renderTicketCard = (ticketId: string, ticket: TambolaTicket) => {
    const isSelected = selectedTicketId === ticketId;
    const isCurrentlyBooked = ticket.isBooked;
    
    return (
      <div
        key={ticketId}
        className={`
          relative p-3 border rounded-lg cursor-pointer transition-all duration-200
          ${isSelected ? 'ring-2 ring-blue-500 border-blue-300' : ''}
          ${isCurrentlyBooked 
            ? 'border-green-300 bg-green-50 hover:bg-green-100' 
            : 'border-gray-200 bg-white hover:bg-gray-50'
          }
          ${(isBooking || isUpdating || isExpanding) ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        onClick={() => handleTicketClick(ticketId, ticket)}
      >
        <div className="flex items-center justify-between mb-2">
          <Badge 
            variant={isCurrentlyBooked ? "default" : "outline"}
            className={isCurrentlyBooked ? "bg-green-600" : ""}
          >
            T{ticketId}
          </Badge>
          {isCurrentlyBooked ? (
            <CheckCircle className="w-4 h-4 text-green-600" />
          ) : (
            <XCircle className="w-4 h-4 text-gray-400" />
          )}
        </div>
        
        {isCurrentlyBooked ? (
          <div className="space-y-1">
            <p className="font-medium text-sm truncate">{ticket.playerName}</p>
            <p className="text-xs text-gray-600 truncate">{ticket.playerPhone}</p>
            <p className="text-xs text-gray-500">
              {new Date(ticket.bookedAt).toLocaleDateString()}
            </p>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-sm text-gray-500">Available</p>
          </div>
        )}
      </div>
    );
  };

  const renderListView = () => (
    <div className="space-y-2">
      {paginatedTickets.map(([ticketId, ticket]) => (
        <div
          key={ticketId}
          className={`
            p-4 border rounded-lg cursor-pointer transition-colors
            ${ticket.isBooked 
              ? 'border-green-300 bg-green-50 hover:bg-green-100' 
              : 'border-gray-200 bg-white hover:bg-gray-50'
            }
            ${selectedTicketId === ticketId ? 'ring-2 ring-blue-500' : ''}
            ${(isBooking || isUpdating || isExpanding) ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          onClick={() => handleTicketClick(ticketId, ticket)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Badge 
                variant={ticket.isBooked ? "default" : "outline"}
                className={ticket.isBooked ? "bg-green-600" : ""}
              >
                T{ticketId}
              </Badge>
              
              {ticket.isBooked ? (
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <User className="w-4 h-4 text-gray-500" />
                    <span className="font-medium">{ticket.playerName}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Phone className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-600">{ticket.playerPhone}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-500 text-sm">
                      {new Date(ticket.bookedAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              ) : (
                <span className="text-gray-500">Available for booking</span>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              {ticket.isBooked && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnbookTicket(ticketId);
                  }}
                  disabled={isBooking || isUpdating || isExpanding}
                  className="text-red-600 hover:text-red-700"
                >
                  Unbook
                </Button>
              )}
              {ticket.isBooked ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <XCircle className="w-5 h-5 text-gray-400" />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  // ================== MAIN RENDER ==================

  return (
    <div className="space-y-6">
      {/* ✅ LOADING OVERLAY - Updated to include expansion state */}
      {(isBooking || isUpdating || isExpanding) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 flex items-center space-x-4">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="font-medium">
              {isBooking ? 'Booking...' : isUpdating ? 'Updating...' : 'Expanding tickets...'}
            </span>
          </div>
        </div>
      )}

      {/* Statistics Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center">
              <Ticket className="w-5 h-5 mr-2" />
              Ticket Management
            </span>
            <div className="flex items-center space-x-2">
              <Button
                size="sm"
                variant="outline"
                onClick={onRefreshGame}
                disabled={isBooking || isUpdating || isExpanding}
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Refresh
              </Button>
              {ticketInfo.bookedTickets > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={exportBookingData}
                  disabled={isBooking || isUpdating || isExpanding}
                >
                  <Download className="w-4 h-4 mr-1" />
                  Export
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* ✅ NEW: Expansion Progress Indicator */}
          {isExpanding && (
            <Alert className="mb-4 border-blue-200 bg-blue-50">
              <Clock className="h-4 w-4" />
              <AlertDescription className="text-blue-800">
                📈 Expanding tickets in progress... Adding new tickets to reach {gameData.maxTickets} total tickets.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{ticketInfo.totalTickets}</p>
              <p className="text-sm text-blue-700">Total Tickets</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">{ticketInfo.bookedTickets}</p>
              <p className="text-sm text-green-700">Booked</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-600">{ticketInfo.availableTickets}</p>
              <p className="text-sm text-gray-700">Available</p>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <p className="text-2xl font-bold text-orange-600">
                {((ticketInfo.bookedTickets / ticketInfo.totalTickets) * 100).toFixed(0)}%
              </p>
              <p className="text-sm text-orange-700">Booking Rate</p>
            </div>
          </div>

          {/* Recent Bookings */}
          {ticketInfo.recentBookings.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3 flex items-center">
                <Users className="w-5 h-5 mr-2" />
                Recent Bookings
              </h3>
              <div className="space-y-2">
                {ticketInfo.recentBookings.map((ticket) => (
                  <div key={ticket.ticketId} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Badge className="bg-green-600">T{ticket.ticketId}</Badge>
                      <span className="font-medium">{ticket.playerName}</span>
                      <span className="text-gray-600">{ticket.playerPhone}</span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {new Date(ticket.bookedAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Controls and Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Tickets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 mb-6">
            {/* Search and View Toggle */}
            <div className="flex flex-col md:flex-row md:items-center space-y-2 md:space-y-0 md:space-x-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search tickets, names, or phone numbers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    disabled={isBooking || isUpdating || isExpanding}
                  />
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowGridView(!showGridView)}
                  disabled={isBooking || isUpdating || isExpanding}
                >
                  {showGridView ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  {showGridView ? 'List View' : 'Grid View'}
                </Button>
              </div>
            </div>

            {/* Filters and Sorting */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <Label>Filter:</Label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as FilterOption)}
                  className="px-3 py-1 border rounded-md"
                  disabled={isBooking || isUpdating || isExpanding}
                >
                  <option value="all">All Tickets</option>
                  <option value="booked">Booked Only</option>
                  <option value="available">Available Only</option>
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <Label>Sort by:</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSortChange('id')}
                  disabled={isBooking || isUpdating || isExpanding}
                  className="flex items-center space-x-1"
                >
                  <span>ID</span>
                  {sortBy === 'id' && (
                    sortDirection === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSortChange('name')}
                  disabled={isBooking || isUpdating || isExpanding}
                  className="flex items-center space-x-1"
                >
                  <span>Name</span>
                  {sortBy === 'name' && (
                    sortDirection === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSortChange('date')}
                  disabled={isBooking || isUpdating || isExpanding}
                  className="flex items-center space-x-1"
                >
                  <span>Date</span>
                  {sortBy === 'date' && (
                    sortDirection === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Tickets Display */}
          {filteredAndSortedTickets.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No tickets found matching your criteria</p>
            </div>
          ) : (
            <>
              {showGridView ? (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                  {paginatedTickets.map(([ticketId, ticket]) => renderTicketCard(ticketId, ticket))}
                </div>
              ) : (
                renderListView()
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <p className="text-sm text-gray-600">
                    Showing {((currentPage - 1) * TICKETS_PER_PAGE) + 1} to {Math.min(currentPage * TICKETS_PER_PAGE, filteredAndSortedTickets.length)} of {filteredAndSortedTickets.length} tickets
                  </p>
                  
                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1 || isBooking || isUpdating || isExpanding}
                    >
                      Previous
                    </Button>
                    
                    <span className="text-sm text-gray-600">
                      Page {currentPage} of {totalPages}
                    </span>
                    
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages || isBooking || isUpdating || isExpanding}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Booking Form Modal */}
      {showBookingForm && selectedTicketId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Book Ticket {selectedTicketId}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="playerName">Player Name</Label>
                <Input
                  id="playerName"
                  value={bookingForm.playerName}
                  onChange={(e) => setBookingForm(prev => ({ ...prev, playerName: e.target.value }))}
                  placeholder="Enter player name"
                  disabled={isBooking}
                />
              </div>
              
              <div>
                <Label htmlFor="playerPhone">WhatsApp Number</Label>
                <Input
                  id="playerPhone"
                  type="tel"
                  value={bookingForm.playerPhone}
                  onChange={(e) => setBookingForm(prev => ({ ...prev, playerPhone: e.target.value }))}
                  placeholder="Enter WhatsApp number"
                  disabled={isBooking}
                />
              </div>
              
              <div className="flex justify-end space-x-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowBookingForm(false);
                    setSelectedTicketId(null);
                    setBookingForm({ playerName: '', playerPhone: '' });
                  }}
                  disabled={isBooking}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleBookTicket}
                  disabled={isBooking || !bookingForm.playerName.trim() || !bookingForm.playerPhone.trim()}
                >
                  {isBooking ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Booking...
                    </>
                  ) : (
                    'Book Ticket'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Ticket Details Modal */}
      {selectedTicketId && !showBookingForm && gameData.tickets[selectedTicketId]?.isBooked && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Ticket {selectedTicketId} Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Status:</span>
                  <Badge className="bg-green-600">Booked</Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="font-medium">Player:</span>
                  <span>{gameData.tickets[selectedTicketId].playerName}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="font-medium">Phone:</span>
                  <span>{gameData.tickets[selectedTicketId].playerPhone}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="font-medium">Booked At:</span>
                  <span className="text-sm">
                    {new Date(gameData.tickets[selectedTicketId].bookedAt).toLocaleString()}
                  </span>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3">
                <Button
                  variant="outline"
                  onClick={() => setSelectedTicketId(null)}
                  disabled={isUpdating}
                >
                  Close
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleUnbookTicket(selectedTicketId)}
                  disabled={isUpdating}
                >
                  {isUpdating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Unbooking...
                    </>
                  ) : (
                    'Unbook Ticket'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Calendar, momentLocalizer, View } from 'react-big-calendar';
import moment from 'moment';
import { fetchDetailedTimeLogs } from '@/domains/time/services/time-logs.service';
import { fetchOrgUsers } from '@/domains/people';
import { calculateSessionHours } from '@/lib/time-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/providers/auth-provider';
import { toast } from 'sonner';
import { User, Clock, Calendar as CalendarIcon, Timer, Activity } from 'lucide-react';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import './calendar-styles.css'; // Import our custom styles

// Configure moment to start week on Sunday
moment.locale('en', {
  week: {
    dow: 0, // Sunday is the first day of the week
    doy: 6  // The week that contains Jan 6th is the first week of the year
  }
});

const localizer = momentLocalizer(moment);

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resource?: {
    userId: string;
    userName: string;
    userEmail?: string;
    isOngoing: boolean;
    duration?: number;
  };
}

export default function CalendarPage() {
  const { userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<View>('week');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  useEffect(() => {
    if (userDetails?.role === 'admin') {
      fetchTimeTrackingData();
    }
  }, [userDetails, currentDate, currentView, organizationId, isSuperAdmin]);

  const fetchTimeTrackingData = async () => {
    try {
      setLoading(true);
      
      // Get data for the appropriate range based on current view
      let startDate: string;
      let endDate: string;
      
      switch (currentView) {
        case 'month':
          startDate = moment(currentDate).startOf('month').toISOString();
          endDate = moment(currentDate).endOf('month').toISOString();
          break;
        case 'week':
          startDate = moment(currentDate).startOf('week').toISOString();
          endDate = moment(currentDate).endOf('week').toISOString();
          break;
        case 'day':
          startDate = moment(currentDate).startOf('day').toISOString();
          endDate = moment(currentDate).endOf('day').toISOString();
          break;
        case 'agenda':
          startDate = moment(currentDate).startOf('month').toISOString();
          endDate = moment(currentDate).endOf('month').toISOString();
          break;
        default:
          startDate = moment(currentDate).startOf('week').toISOString();
          endDate = moment(currentDate).endOf('week').toISOString();
      }
      
      console.log(`Fetching data for ${currentView} view:`, startDate, 'to', endDate);

      const orgUsers = await fetchOrgUsers({ organizationId, isSuperAdmin });
      const userById = new Map(orgUsers.map((u) => [u.id, u]));

      const timeLogs = await fetchDetailedTimeLogs(
        new Date(startDate),
        new Date(endDate),
        { organizationId, isSuperAdmin },
        { limit: 10000 },
      );

      const calendarEvents: CalendarEvent[] = timeLogs?.map((log: any) => {
        const start = new Date(log.start_time);
        const sessionHours = calculateSessionHours(log.start_time, log.end_time);
        const end = log.end_time ? new Date(log.end_time) : new Date(start.getTime() + sessionHours * 3600000);
        const user = userById.get(log.user_id) || log.users;
        const userName = user?.full_name || user?.email || 'Unknown';
        const userEmail = user?.email || '';
        const duration = Math.round(sessionHours * 60);
        
        return {
          id: log.id,
          title: `${userName} - Work Session`,
          start,
          end,
          resource: {
            userId: log.user_id,
            userName,
            userEmail,
            isOngoing: !log.end_time,
            duration
          }
        };
      }) || [];

      console.log('Calendar events:', calendarEvents);
      setEvents(calendarEvents);

    } catch (error) {
      console.error('Error fetching time tracking data:', error);
      toast.error('Failed to load calendar data');
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (newDate: Date) => {
    console.log('Navigating to:', newDate);
    setCurrentDate(newDate);
  };

  const handleViewChange = (view: View) => {
    console.log('Changing view to:', view);
    setCurrentView(view);
  };

  const handleSelectEvent = (event: CalendarEvent) => {
    console.log('Selected event:', event);
    setSelectedEvent(event);
    setIsDetailsModalOpen(true);
  };

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) {
      return `${hours}h`;
    }
    return `${hours}h ${remainingMinutes}m`;
  };

  // Custom event style
  const eventStyleGetter = (event: CalendarEvent) => {
    let backgroundColor = '#3174ad'; // Default blue
    
    if (event.resource?.isOngoing) {
      backgroundColor = '#ed8936'; // Orange for ongoing sessions
    }

    return {
      style: {
        backgroundColor,
        borderRadius: '4px',
        opacity: 0.8,
        color: 'white',
        border: '0px',
        display: 'block'
      }
    };
  };

  if (userDetails?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Access denied. Admin privileges required.</p>
      </div>
    );
  }

  return (
    <div className="calendar-page-container">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Time Tracking Calendar</h1>
            <p className="text-muted-foreground">View employee work sessions</p>
          </div>
          <Button onClick={fetchTimeTrackingData} variant="outline">
            Refresh
          </Button>
        </div>

        {/* Calendar */}
        <Card>
          <CardHeader>
            <CardTitle>
              {currentView.charAt(0).toUpperCase() + currentView.slice(1)} View
            </CardTitle>
          </CardHeader>
          <CardContent>


            {loading ? (
              <div className="flex items-center justify-center h-96">
                <p>Loading calendar...</p>
              </div>
            ) : (
              <div className="calendar-container" style={{ height: 600 }}>
                <Calendar
                  localizer={localizer}
                  events={events}
                  startAccessor="start"
                  endAccessor="end"
                  style={{ height: '100%' }}
                  view={currentView}
                  views={['month', 'week', 'day', 'agenda']}
                  date={currentDate}
                  onNavigate={handleNavigate}
                  onView={handleViewChange}
                  onSelectEvent={handleSelectEvent}
                  eventPropGetter={eventStyleGetter}
                  step={60}
                  showMultiDayTimes
                  popup
                  formats={{
                    timeGutterFormat: 'h:mm A',
                    eventTimeRangeFormat: ({ start, end }, culture, localizer) =>
                      localizer ? `${localizer.format(start, 'h:mm A', culture)} - ${localizer.format(end, 'h:mm A', culture)}` : ''
                  }}
                  components={{
                    toolbar: (props) => {
                      const { label, onNavigate, onView, views } = props;
                      
                      // Convert views to an array of view names
                      const viewNames: View[] = ['month', 'week', 'day', 'agenda'];
                      
                      return (
                        <div className="rbc-toolbar">
                          <span className="rbc-btn-group">
                            <button
                              type="button"
                              onClick={() => onNavigate('PREV')}
                              className="rbc-btn"
                            >
                              Back
                            </button>
                            <button
                              type="button"
                              onClick={() => onNavigate('TODAY')}
                              className="rbc-btn"
                            >
                              Today
                            </button>
                            <button
                              type="button"
                              onClick={() => onNavigate('NEXT')}
                              className="rbc-btn"
                            >
                              Next
                            </button>
                          </span>
                          
                          <span className="rbc-toolbar-label">{label}</span>
                          
                          <span className="rbc-btn-group">
                            {viewNames.map((view: View) => (
                              <button
                                key={view}
                                type="button"
                                className={`rbc-btn ${currentView === view ? 'rbc-active' : ''}`}
                                onClick={() => onView(view)}
                              >
                                {view.charAt(0).toUpperCase() + view.slice(1)}
                              </button>
                            ))}
                          </span>
                        </div>
                      );
                    }
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Event List */}
        <Card>
          <CardHeader>
            <CardTitle>Events This {currentView === 'day' ? 'Day' : currentView === 'week' ? 'Week' : 'Month'}</CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-muted-foreground">No events found for this period</p>
            ) : (
              <div className="space-y-2">
                {events.map(event => (
                  <div 
                    key={event.id} 
                    className="flex justify-between items-center p-2 border rounded cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleSelectEvent(event)}
                  >
                    <div>
                      <strong>{event.title}</strong>
                      <br />
                      <span className="text-sm text-muted-foreground">
                        {moment(event.start).format('MMM DD, h:mm A')} - {moment(event.end).format('MMM DD, h:mm A')}
                      </span>
                    </div>
                    {event.resource?.isOngoing && (
                      <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                        ONGOING
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Event Details Modal */}
      <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-blue-500" />
              Work Session Details
            </DialogTitle>
            <DialogDescription>
              Full information about this work session
            </DialogDescription>
          </DialogHeader>
          
          {selectedEvent && (
            <div className="space-y-4 py-4">
              {/* Employee Info */}
              <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                <User className="h-5 w-5 text-gray-500 mt-0.5" />
                <div>
                  <div className="font-medium">{selectedEvent.resource?.userName}</div>
                  {selectedEvent.resource?.userEmail && (
                    <div className="text-sm text-muted-foreground">{selectedEvent.resource.userEmail}</div>
                  )}
                </div>
                {selectedEvent.resource?.isOngoing && (
                  <Badge variant="default" className="ml-auto bg-orange-500">
                    <Activity className="h-3 w-3 mr-1" />
                    ONGOING
                  </Badge>
                )}
              </div>

              {/* Time Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 border rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Clock className="h-4 w-4" />
                    Start Time
                  </div>
                  <div className="font-medium">
                    {moment(selectedEvent.start).format('h:mm A')}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {moment(selectedEvent.start).format('dddd, MMM D, YYYY')}
                  </div>
                </div>
                
                <div className="p-3 border rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Clock className="h-4 w-4" />
                    End Time
                  </div>
                  <div className="font-medium">
                    {selectedEvent.resource?.isOngoing ? (
                      <span className="text-orange-500">In Progress</span>
                    ) : (
                      moment(selectedEvent.end).format('h:mm A')
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {selectedEvent.resource?.isOngoing ? 
                      'Session still active' : 
                      moment(selectedEvent.end).format('dddd, MMM D, YYYY')
                    }
                  </div>
                </div>
              </div>

              {/* Duration */}
              <div className="p-3 border rounded-lg">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Timer className="h-4 w-4" />
                  Duration
                </div>
                <div className="text-2xl font-bold text-blue-600">
                  {selectedEvent.resource?.duration ? formatDuration(selectedEvent.resource.duration) : 'N/A'}
                </div>
                <div className="text-sm text-muted-foreground">
                  {selectedEvent.resource?.isOngoing && 'Current duration (session ongoing)'}
                </div>
              </div>

              {/* Session ID */}
              <div className="text-xs text-muted-foreground">
                Session ID: {selectedEvent.id}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailsModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

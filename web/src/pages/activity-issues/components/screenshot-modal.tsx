// Screenshot Modal Component - Full size viewer with navigation
import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Clock, 
  Monitor, 
  Activity,
  User,
  ZoomIn,
  ZoomOut,
  Download,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';

export interface ScreenshotForModal {
  id: string;
  imageUrl: string;
  capturedAt: string;
  activityPercent: number;
  appName?: string;
}

interface ScreenshotModalProps {
  screenshots: ScreenshotForModal[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
  issueType?: string;
}

export function ScreenshotModal({
  screenshots,
  initialIndex,
  isOpen,
  onClose,
  userName,
  issueType,
}: ScreenshotModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isZoomed, setIsZoomed] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Reset index when modal opens with new screenshots
  useEffect(() => {
    setCurrentIndex(initialIndex);
    setImageError(false);
    setIsZoomed(false);
  }, [initialIndex, screenshots]);

  const currentScreenshot = screenshots[currentIndex];

  const goToPrevious = useCallback(() => {
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : screenshots.length - 1));
    setImageError(false);
  }, [screenshots.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex(prev => (prev < screenshots.length - 1 ? prev + 1 : 0));
    setImageError(false);
  }, [screenshots.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          goToPrevious();
          break;
        case 'ArrowRight':
          e.preventDefault();
          goToNext();
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, goToPrevious, goToNext, onClose]);

  if (!currentScreenshot) return null;

  const getActivityColor = (percent: number) => {
    if (percent >= 70) return 'text-green-600 bg-green-100';
    if (percent >= 40) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = currentScreenshot.imageUrl;
    link.download = `screenshot-${currentScreenshot.id}.png`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenInNewTab = () => {
    window.open(currentScreenshot.imageUrl, '_blank');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[95vh] p-0 overflow-hidden bg-gray-900">
        {/* Header */}
        <DialogHeader className="p-4 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-white text-lg">
                Screenshot Evidence
              </DialogTitle>
              {issueType && (
                <Badge variant="outline" className="text-gray-300 border-gray-600">
                  {issueType}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-white hover:bg-gray-700"
                onClick={() => setIsZoomed(!isZoomed)}
              >
                {isZoomed ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-white hover:bg-gray-700"
                onClick={handleOpenInNewTab}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-white hover:bg-gray-700"
                onClick={handleDownload}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-white hover:bg-gray-700"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Main Content */}
        <div className="relative flex-1 flex items-center justify-center bg-gray-900 min-h-[400px]">
          {/* Navigation Arrows */}
          {screenshots.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="lg"
                className="absolute left-2 z-10 h-12 w-12 rounded-full bg-black/50 hover:bg-black/70 text-white"
                onClick={goToPrevious}
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="absolute right-2 z-10 h-12 w-12 rounded-full bg-black/50 hover:bg-black/70 text-white"
                onClick={goToNext}
              >
                <ChevronRight className="h-8 w-8" />
              </Button>
            </>
          )}

          {/* Image */}
          <div className={`flex items-center justify-center p-4 ${isZoomed ? 'overflow-auto' : ''}`}>
            {imageError ? (
              <div className="flex flex-col items-center justify-center text-gray-500 p-12">
                <Monitor className="h-16 w-16 mb-4" />
                <p>Failed to load screenshot</p>
                <p className="text-sm mt-2">{currentScreenshot.imageUrl}</p>
              </div>
            ) : (
              <img
                src={currentScreenshot.imageUrl}
                alt={`Screenshot ${currentIndex + 1}`}
                className={`
                  ${isZoomed ? 'max-w-none' : 'max-w-full max-h-[60vh]'}
                  object-contain rounded-lg shadow-2xl
                  transition-transform duration-200
                `}
                onError={() => setImageError(true)}
              />
            )}
          </div>
        </div>

        {/* Footer with metadata */}
        <div className="p-4 bg-gray-800 border-t border-gray-700">
          <div className="flex items-center justify-between">
            {/* Left side - metadata */}
            <div className="flex flex-wrap items-center gap-4 text-sm">
              {userName && (
                <div className="flex items-center gap-1.5 text-gray-400">
                  <User className="h-4 w-4" />
                  <span className="text-white font-medium">{userName}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-gray-400">
                <Clock className="h-4 w-4" />
                <span className="text-white">
                  {format(new Date(currentScreenshot.capturedAt), 'MMM dd, yyyy HH:mm:ss')}
                </span>
              </div>
              {currentScreenshot.appName && (
                <div className="flex items-center gap-1.5 text-gray-400">
                  <Monitor className="h-4 w-4" />
                  <span className="text-white">{currentScreenshot.appName}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-gray-400" />
                <Badge className={`text-xs ${getActivityColor(currentScreenshot.activityPercent)}`}>
                  {currentScreenshot.activityPercent}% Activity
                </Badge>
              </div>
            </div>

            {/* Right side - navigation indicator */}
            <div className="flex items-center gap-3">
              <span className="text-gray-400 text-sm">
                {currentIndex + 1} of {screenshots.length}
              </span>
              {/* Thumbnail dots */}
              <div className="flex gap-1">
                {screenshots.map((_, idx) => (
                  <button
                    key={idx}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      idx === currentIndex 
                        ? 'bg-blue-500' 
                        : 'bg-gray-600 hover:bg-gray-500'
                    }`}
                    onClick={() => {
                      setCurrentIndex(idx);
                      setImageError(false);
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


import React from 'react';

interface EbdaaTimeLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

const EbdaaTimeLogo: React.FC<EbdaaTimeLogoProps> = ({ 
  size = 40, 
  className = '', 
  showText = false 
}) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img
        src="/alysonlogo.svg"
        alt="Alyson Time Doctor"
        style={{ height: size, width: 'auto' }}
        className="shrink-0"
      />
      
      {showText && (
        <div className="flex flex-col">
          <span className="font-bold text-lg text-primary">Alyson Time Doctor</span>
          <span className="text-xs text-muted-foreground">Time Tracking</span>
        </div>
      )}
    </div>
  );
};

export default EbdaaTimeLogo; 
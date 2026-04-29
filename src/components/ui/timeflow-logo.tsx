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
        alt="Alyson PM"
        style={{ height: size, width: 'auto' }}
        className="shrink-0"
      />
      
      {showText && (
        <div className="flex flex-col">
          <span className="font-bold text-lg text-primary">Alyson PM</span>
          <span className="text-xs text-muted-foreground">Project Management</span>
        </div>
      )}
    </div>
  );
};

export default EbdaaTimeLogo; 
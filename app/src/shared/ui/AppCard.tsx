import React from 'react';
import { Card as ShadcnCard, CardContent } from '@/shared/ui/card';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

const AppCard: React.FC<CardProps> = ({ children, className = '' }) => {
  return (
    <div className="flex flex-col h-screen items-center justify-center bg-background text-foreground text-center p-4">
      <ShadcnCard className={`rounded-2xl p-6 max-[768px]:p-4 border border-border shadow-[0_8px_32px_rgba(0,0,0,0.3)] max-w-[400px] w-full ${className}`}>
        <CardContent className="p-0 pt-0">
          {children}
        </CardContent>
      </ShadcnCard>
    </div>
  );
};

export default AppCard;

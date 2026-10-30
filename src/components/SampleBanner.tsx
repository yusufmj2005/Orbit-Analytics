import React from 'react';
import { AlertCircle, X } from 'lucide-react';

interface SampleBannerProps {
  onClear: () => void;
}

export const SampleBanner: React.FC<SampleBannerProps> = ({ onClear }) => {
  return (
    <div className="sample-banner">
      <div className="sample-banner-content">
        <AlertCircle size={16} />
        <div>
          <strong>SAMPLE PREVIEW MODE ACTIVE:</strong>
          <span>
            {' '}Visualizing realistic demonstration data for Website Analytics and Financials. No connected accounts or credentials were used to produce this sample preview.
          </span>
        </div>
      </div>
      <button className="sample-clear-btn" onClick={onClear}>
        <X size={13} />
        <span>Clear Sample Data</span>
      </button>
    </div>
  );
};

